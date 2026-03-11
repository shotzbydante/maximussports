import { useCallback, useRef, useState } from 'react';

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
const MAX_SIZE_MB = 500;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export default function VideoUploader({ onFileSelected, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);

  const validate = useCallback((file) => {
    if (!file) return 'No file selected.';
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(mp4|mov|m4v)$/i)) {
      return 'Unsupported format. Please use .mp4 or .mov files.';
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max ${MAX_SIZE_MB} MB.`;
    }
    return null;
  }, []);

  const handleFile = useCallback((file) => {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError(null);
    onFileSelected(file);
  }, [validate, onFileSelected]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const onChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{
        border: `2px dashed ${dragOver ? '#3C79B4' : 'rgba(60,121,180,0.25)'}`,
        borderRadius: 12,
        padding: '32px 20px',
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        background: dragOver ? 'rgba(60,121,180,0.06)' : 'rgba(60,121,180,0.02)',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.mov,.m4v,video/mp4,video/quicktime"
        onChange={onChange}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: 28, marginBottom: 8 }}>🎬</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#c8d6e5' }}>
        {dragOver ? 'Drop video here' : 'Upload screen recording'}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 4 }}>
        .mp4 or .mov · up to {MAX_SIZE_MB} MB
      </div>
      {error && (
        <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 8, fontWeight: 500 }}>
          {error}
        </div>
      )}
    </div>
  );
}
