import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import './NewSession.css';

const TABS = [
  { id: 'upload', label: 'Upload File', icon: '📄' },
  { id: 'paste', label: 'Paste Notes', icon: '📝' },
  { id: 'topic', label: 'Enter Topic', icon: '💡' },
  { id: 'youtube', label: 'YouTube URL', icon: '🎬' },
];

export default function NewSession() {
  const [tab, setTab] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    subject: '',
    content: '',
    topic: '',
    url: '',
    file: null,
  });

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;

      if (tab === 'upload') {
        if (!form.file) throw new Error('Please select a file');
        const fd = new FormData();
        fd.append('file', form.file);
        fd.append('title', form.title || form.file.name);
        fd.append('subject', form.subject || 'General');
        result = await api.learning.upload(fd);
      } else if (tab === 'paste') {
        result = await api.learning.paste({
          title: form.title,
          subject: form.subject || 'General',
          content: form.content,
        });
      } else if (tab === 'topic') {
        result = await api.learning.topic({
          topic: form.topic,
          subject: form.subject || 'General',
        });
      } else if (tab === 'youtube') {
        result = await api.learning.youtube({
          url: form.url,
          title: form.title || 'YouTube Lesson',
          subject: form.subject || 'General',
        });
      }

      navigate(`/sessions/${result.session._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">New Learning Session</h1>
      <p className="page-subtitle">Upload material or enter a topic — AI will analyze and build your learning path</p>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            type="button"
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="card session-form">
        {tab === 'upload' && (
          <>
            <div className="form-group">
              <label>File (PDF, DOCX, TXT)</label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={(e) => setForm({ ...form, file: e.target.files[0] })}
                required
              />
            </div>
            <div className="form-group">
              <label>Title (optional)</label>
              <input type="text" value={form.title} onChange={update('title')} placeholder="e.g. Operating Systems Notes" />
            </div>
          </>
        )}

        {tab === 'paste' && (
          <>
            <div className="form-group">
              <label>Title</label>
              <input type="text" value={form.title} onChange={update('title')} required placeholder="Session title" />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.content} onChange={update('content')} required rows={10} placeholder="Paste your study notes here..." />
            </div>
          </>
        )}

        {tab === 'topic' && (
          <div className="form-group">
            <label>Topic</label>
            <input type="text" value={form.topic} onChange={update('topic')} required placeholder="e.g. Operating System Deadlocks" />
          </div>
        )}

        {tab === 'youtube' && (
          <>
            <div className="form-group">
              <label>YouTube URL</label>
              <input type="url" value={form.url} onChange={update('url')} required placeholder="https://youtube.com/watch?v=..." />
            </div>
            <div className="form-group">
              <label>Title (optional)</label>
              <input type="text" value={form.title} onChange={update('title')} placeholder="Video title" />
            </div>
          </>
        )}

        {tab !== 'topic' && tab !== 'paste' && (
          <div className="form-group">
            <label>Subject</label>
            <input type="text" value={form.subject} onChange={update('subject')} placeholder="e.g. Computer Science" />
          </div>
        )}

        {tab === 'topic' && (
          <div className="form-group">
            <label>Subject</label>
            <input type="text" value={form.subject} onChange={update('subject')} placeholder="e.g. Computer Science" />
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Creating session...' : 'Create & Analyze with AI'}
        </button>
      </form>
    </div>
  );
}
