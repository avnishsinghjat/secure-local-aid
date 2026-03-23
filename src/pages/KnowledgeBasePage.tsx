import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { runQuery, runExec } from '@/lib/database';
import { extractText, chunkText, type ExtractionProgress } from '@/lib/document-processor';
import { storeEmbeddings, deleteDocumentEmbeddings, hasEmbeddings, getTotalChunks } from '@/lib/vector-store';
import { createEmbeddings, getLMStudioConfig } from '@/lib/lmstudio';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  BookOpen, Upload, Search, FileText, Download, Trash2, Eye,
  Plus, Filter, Tag, Clock, User, File, X, Brain, CheckCircle2,
  AlertCircle, Loader2, Cpu, Layers, ScanLine, ImageIcon
} from 'lucide-react';

interface KBDocument {
  id: number;
  title: string;
  description: string;
  category: string;
  doc_type: string;
  filename: string;
  mime_type: string;
  size: number;
  data_b64: string;
  tags: string;
  uploaded_by: number;
  uploader_name: string;
  version: string;
  status: string;
  created_at: string;
  updated_at: string;
}

type EmbedStatus = 'none' | 'processing' | 'done' | 'error';
type ProcessingStage = 'extracting' | 'ocr' | 'embedding';

const DOC_TYPES = ['SOP', 'Manual', 'Policy', 'Guideline', 'Procedure', 'Reference', 'Training Material'];
const CATEGORIES = [
  'General', 'IT Operations', 'Security', 'Communications', 'Equipment Management',
  'Logistics', 'Administration', 'Training', 'Maintenance', 'Emergency Procedures'
];

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [viewDoc, setViewDoc] = useState<KBDocument | null>(null);
  const [embedStatus, setEmbedStatus] = useState<Record<number, EmbedStatus>>({});
  const [embedProgress, setEmbedProgress] = useState<Record<number, { done: number; total: number; stage?: ProcessingStage; detail?: string }>>({}); 
  const [totalChunks, setTotalChunks] = useState(0);

  // Upload form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [docType, setDocType] = useState('SOP');
  const [tags, setTags] = useState('');
  const [version, setVersion] = useState('1.0');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processAfterUpload, setProcessAfterUpload] = useState(true);

  const canManage = user && ['super_admin', 'admin', 'g1_triage'].includes(user.role);

  const loadDocuments = useCallback(async () => {
    let sql = `SELECT kb.*, u.display_name as uploader_name FROM kb_documents kb
               LEFT JOIN users u ON kb.uploaded_by = u.id WHERE kb.status = 'active'`;
    const params: unknown[] = [];

    if (filterCategory !== 'all') { sql += ' AND kb.category = ?'; params.push(filterCategory); }
    if (filterType !== 'all') { sql += ' AND kb.doc_type = ?'; params.push(filterType); }
    if (searchQuery.trim()) {
      sql += ' AND (kb.title LIKE ? OR kb.description LIKE ? OR kb.tags LIKE ?)';
      const q = `%${searchQuery.trim()}%`;
      params.push(q, q, q);
    }
    sql += ' ORDER BY kb.updated_at DESC';

    const rows = await runQuery(sql, params);
    setDocuments(rows as KBDocument[]);

    // Check embedding status for each doc
    const statuses: Record<number, EmbedStatus> = {};
    for (const doc of rows as KBDocument[]) {
      statuses[doc.id] = (await hasEmbeddings(doc.id)) ? 'done' : 'none';
    }
    setEmbedStatus(statuses);
    setTotalChunks(await getTotalChunks());
  }, [searchQuery, filterCategory, filterType]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const processDocument = async (doc: KBDocument, fileObj?: File) => {
    setEmbedStatus((p) => ({ ...p, [doc.id]: 'processing' }));
    setEmbedProgress((p) => ({ ...p, [doc.id]: { done: 0, total: 0 } }));

    try {
      const ocrProgress = (progress: ExtractionProgress) => {
        setEmbedProgress((p) => ({
          ...p,
          [doc.id]: {
            done: progress.current,
            total: progress.total,
            stage: progress.stage,
            detail: progress.detail,
          },
        }));
      };

      let textContent = '';
      if (fileObj) {
        textContent = await extractText(fileObj, ocrProgress);
      } else if (doc.data_b64) {
        const byteChars = atob(doc.data_b64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: doc.mime_type });
        const reconstructed = new File([blob], doc.filename, { type: doc.mime_type });
        textContent = await extractText(reconstructed, ocrProgress);
      }

      if (!textContent.trim()) {
        throw new Error('No text could be extracted from this file. The document may be empty or the image too low-quality for OCR.');
      }

      const chunks = chunkText(textContent);
      if (chunks.length === 0) throw new Error('No text chunks generated from document.');

      setEmbedProgress((p) => ({ ...p, [doc.id]: { done: 0, total: chunks.length, stage: 'embedding' } }));

      const config = getLMStudioConfig();
      const embeddings = await createEmbeddings(chunks, config, (done, total) => {
        setEmbedProgress((p) => ({ ...p, [doc.id]: { done, total, stage: 'embedding' } }));
      });

      await storeEmbeddings(doc.id, chunks, embeddings, {
        docTitle: doc.title,
        docCategory: doc.category,
        docType: doc.doc_type,
      });

      setEmbedStatus((p) => ({ ...p, [doc.id]: 'done' }));
      setTotalChunks(await getTotalChunks());
      toast({
        title: 'Document processed',
        description: `"${doc.title}" — ${chunks.length} chunks embedded.`,
      });
    } catch (err: unknown) {
      setEmbedStatus((p) => ({ ...p, [doc.id]: 'error' }));
      const msg = err instanceof Error ? err.message : 'Processing failed';
      const isConn = msg.includes('fetch') || msg.includes('Failed to fetch');
      toast({
        title: 'Processing failed',
        description: isConn
          ? 'Cannot connect to Local AI. Ensure it is running with an embedding model loaded.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setEmbedProgress((p) => { const n = { ...p }; delete n[doc.id]; return n; });
    }
  };

  const handleUpload = async () => {
    if (!user || !file || !title.trim()) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = (reader.result as string).split(',')[1];
        await runExec(
          `INSERT INTO kb_documents (title, description, category, doc_type, filename, mime_type, size, data_b64, tags, uploaded_by, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [title.trim(), description.trim(), category, docType, file.name, file.type || 'application/octet-stream', file.size, b64, tags.trim(), user.id, version]
        );
        await runExec(
          "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('kb_document', 0, 'upload', ?, ?)",
          [user.id, `Uploaded KB document: ${title.trim()}`]
        );

        toast({ title: 'Document uploaded', description: `"${title.trim()}" added to knowledge base.` });
        resetForm();
        setShowUpload(false);
        await loadDocuments();

        // Auto-process embeddings after upload
        if (processAfterUpload) {
          const rows = await runQuery(
            "SELECT id, title, category, doc_type, filename, mime_type, data_b64 FROM kb_documents WHERE title = ? ORDER BY id DESC LIMIT 1",
            [title.trim()]
          );
          if (rows[0]) {
            await processDocument(rows[0] as KBDocument, file);
          }
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast({ title: 'Upload failed', description: 'Failed to upload document.', variant: 'destructive' });
      setUploading(false);
    }
  };

  const handleDownload = (doc: KBDocument) => {
    if (!doc.data_b64) return;
    const byteChars = atob(doc.data_b64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: doc.mime_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = doc.filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (doc: KBDocument) => {
    if (!user) return;
    await runExec("UPDATE kb_documents SET status = 'archived' WHERE id = ?", [doc.id]);
    await runExec(
      "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('kb_document', ?, 'archive', ?, ?)",
      [doc.id, user.id, `Archived KB document: ${doc.title}`]
    );
    await deleteDocumentEmbeddings(doc.id);
    toast({ title: 'Document removed', description: `"${doc.title}" removed from knowledge base.` });
    loadDocuments();
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setCategory('General'); setDocType('SOP');
    setTags(''); setVersion('1.0'); setFile(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const typeColors: Record<string, string> = {
    SOP: 'bg-primary/10 text-primary border-primary/20',
    Manual: 'bg-accent/10 text-accent border-accent/20',
    Policy: 'bg-destructive/10 text-destructive border-destructive/20',
    Guideline: 'bg-warning/10 text-warning border-warning/20',
    Procedure: 'bg-secondary text-secondary-foreground border-border',
    Reference: 'bg-muted text-muted-foreground border-border',
    'Training Material': 'bg-primary/10 text-primary border-primary/20',
  };

  const processedCount = Object.values(embedStatus).filter((s) => s === 'done').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">SOPs, manuals, and policy documents — AI-searchable</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setShowUpload(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Upload Document
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Documents', value: documents.length, icon: FileText },
          { label: 'AI-Processed', value: processedCount, icon: Brain },
          { label: 'Vector Chunks', value: totalChunks, icon: Layers },
          { label: 'Policies', value: documents.filter((d) => d.doc_type === 'Policy').length, icon: Tag },
        ].map((s) => (
          <Card key={s.label} className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Processing Info */}
      {processedCount < documents.length && documents.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 flex items-start gap-2">
            <Cpu className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <span className="font-medium text-foreground">{documents.length - processedCount} document(s) not yet processed for AI search.</span>
              <span className="text-muted-foreground ml-1">Click the brain icon next to each document to extract text (with OCR for scanned docs/images) and generate embeddings via Local AI.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search & Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, description, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-48">
                <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="p-12 text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No documents found</p>
              <p className="text-xs text-muted-foreground mt-1">Upload documents or adjust your search filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Document</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Category</TableHead>
                  <TableHead className="text-muted-foreground">Version</TableHead>
                  <TableHead className="text-muted-foreground">Size</TableHead>
                  <TableHead className="text-muted-foreground">AI Status</TableHead>
                  <TableHead className="text-muted-foreground">Uploaded By</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const status = embedStatus[doc.id] ?? 'none';
                  const progress = embedProgress[doc.id];
                  return (
                    <TableRow key={doc.id} className="border-border hover:bg-muted/50">
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground text-sm">{doc.title}</p>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{doc.description}</p>
                          )}
                          {doc.tags && (
                            <div className="flex gap-1 flex-wrap">
                              {doc.tags.split(',').map((tag, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  {tag.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeColors[doc.doc_type] || 'bg-muted text-muted-foreground'}>
                          {doc.doc_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.category}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">v{doc.version}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatSize(doc.size)}</TableCell>
                      <TableCell>
                        {status === 'done' && (
                          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Indexed</span>
                          </div>
                        )}
                        {status === 'error' && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Error</span>
                          </div>
                        )}
                        {status === 'processing' && (
                          <div className="space-y-1 min-w-[100px]">
                            <div className="flex items-center gap-1 text-xs text-primary">
                              {progress?.stage === 'ocr' ? (
                                <ScanLine className="w-3 h-3 animate-pulse" />
                              ) : (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              )}
                              <span>
                                {progress?.detail
                                  ? progress.detail
                                  : progress?.stage === 'ocr'
                                    ? `OCR ${progress.done}/${progress.total}`
                                    : progress?.stage === 'embedding'
                                      ? `Embedding ${progress.done}/${progress.total}`
                                      : progress
                                        ? `Extracting ${progress.done}/${progress.total}`
                                        : 'Starting...'}
                              </span>
                            </div>
                            {progress && progress.total > 0 && (
                              <Progress value={(progress.done / progress.total) * 100} className="h-1" />
                            )}
                          </div>
                        )}
                        {status === 'none' && (
                          <span className="text-xs text-muted-foreground">Not indexed</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.uploader_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewDoc(doc)} title="View details">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)} title="Download">
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary hover:text-primary"
                                onClick={() => processDocument(doc)}
                                disabled={status === 'processing'}
                                title={status === 'done' ? 'Re-process embeddings' : 'Process for AI search'}
                              >
                                {status === 'processing'
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Brain className="w-3.5 h-3.5" />}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove Document</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Remove "{doc.title}" from the knowledge base? This will also delete its AI embeddings.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(doc)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> Upload Document</DialogTitle>
            <DialogDescription>Add a new document to the knowledge base</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Version</Label>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="security, policy" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>File *</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    {/\.(png|jpe?g|tiff?|bmp|webp|gif)$/i.test(file.name)
                      ? <ImageIcon className="w-4 h-4 text-primary" />
                      : <FileText className="w-4 h-4 text-primary" />}
                    <span className="text-sm text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({formatSize(file.size)})</span>
                    {/\.(png|jpe?g|tiff?|bmp|webp|gif)$/i.test(file.name) && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                        <ScanLine className="w-2.5 h-2.5 mr-0.5" /> OCR
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Click to select a file</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD, or images (PNG, JPG, TIFF — OCR enabled)</p>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.txt,.md,.csv,.json,.xml,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.webp,.gif"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={processAfterUpload}
                onChange={(e) => setProcessAfterUpload(e.target.checked)}
                className="rounded"
              />
              <Brain className="w-3.5 h-3.5 text-primary" />
              <span className="text-foreground">Process embeddings after upload (requires Local AI)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowUpload(false); }}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!title.trim() || !file || uploading} className="gap-2">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Document Dialog */}
      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent className="max-w-lg">
          {viewDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4" /> {viewDoc.title}
                </DialogTitle>
                <DialogDescription>{viewDoc.description || 'No description'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Type', viewDoc.doc_type],
                    ['Category', viewDoc.category],
                    ['Version', `v${viewDoc.version}`],
                    ['File', viewDoc.filename],
                    ['Size', formatSize(viewDoc.size)],
                    ['Uploaded By', viewDoc.uploader_name],
                    ['Uploaded', new Date(viewDoc.created_at).toLocaleString()],
                    ['AI Status', (embedStatus[viewDoc.id] ?? 'none').replace('done', 'Indexed').replace('none', 'Not indexed')],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {k === 'Uploaded By' && <User className="w-3 h-3" />}
                        {k === 'Uploaded' && <Clock className="w-3 h-3" />}
                        {k === 'AI Status' && <Brain className="w-3 h-3" />}
                        {k}
                      </p>
                      <p className="font-medium text-foreground">{v}</p>
                    </div>
                  ))}
                </div>
                {viewDoc.tags && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</p>
                    <div className="flex gap-1 flex-wrap">
                      {viewDoc.tags.split(',').map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{tag.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewDoc(null)}>Close</Button>
                <Button onClick={() => handleDownload(viewDoc)} className="gap-2">
                  <Download className="w-4 h-4" /> Download
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
