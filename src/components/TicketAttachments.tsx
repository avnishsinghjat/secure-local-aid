import { useEffect, useState, useRef } from 'react';
import { runQuery, runExec } from '@/lib/database';
import { Button } from '@/components/ui/button';
import { Paperclip, Download, Trash2, Upload, FileText, Image, File } from 'lucide-react';

interface Attachment {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  data_b64: string;
  created_at: string;
  uploader_name: string;
}

interface Props {
  ticketId: number;
  userId: number;
  canModify: boolean;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return Image;
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text')) return FileText;
  return File;
}

export default function TicketAttachments({ ticketId, userId, canModify }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const results = await runQuery(`
      SELECT a.*, COALESCE(u.display_name, 'Unknown') as uploader_name
      FROM attachments a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.ticket_id = ?
      ORDER BY a.created_at DESC
    `, [ticketId]);
    setAttachments(results as Attachment[]);
  };

  useEffect(() => { load(); }, [ticketId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // strip data:...;base64,
        };
        reader.readAsDataURL(file);
      });

      await runExec(
        'INSERT INTO attachments (ticket_id, user_id, filename, mime_type, size, data_b64) VALUES (?, ?, ?, ?, ?, ?)',
        [ticketId, userId, file.name, file.type || 'application/octet-stream', file.size, b64]
      );
      await runExec(
        "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'attachment_added', ?, ?)",
        [ticketId, userId, `Uploaded: ${file.name}`]
      );
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    load();
  };

  const downloadFile = (att: Attachment) => {
    const byteChars = atob(att.data_b64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: att.mime_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteFile = async (att: Attachment) => {
    await runExec('DELETE FROM attachments WHERE id = ?', [att.id]);
    await runExec(
      "INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES ('ticket', ?, 'attachment_removed', ?, ?)",
      [ticketId, userId, `Removed: ${att.filename}`]
    );
    load();
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="text-sm font-semibold">
          <Paperclip className="w-4 h-4 inline mr-2" />Attachments ({attachments.length})
        </h3>
        {canModify && (
          <Button size="sm" variant="outline" className="text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="w-3.5 h-3.5 mr-1.5" />{uploading ? 'Uploading...' : 'Upload'}
          </Button>
        )}
      </div>
      <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} />
      <div className="divide-y divide-border">
        {attachments.map((att) => {
          const Icon = getFileIcon(att.mime_type);
          return (
            <div key={att.id} className="flex items-center gap-3 px-4 py-3">
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{att.filename}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatSize(att.size)} • {att.uploader_name} • {new Date(att.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => downloadFile(att)}>
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
                {canModify && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteFile(att)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {attachments.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No attachments.</p>
        )}
      </div>
    </div>
  );
}
