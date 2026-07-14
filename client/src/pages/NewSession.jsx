import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Lightbulb, VideoIcon } from 'lucide-react';
import { api } from '../services/api';
import './NewSession.css';

const TABS = [
  {
    id: 'upload',
    label: 'Upload File',
    icon: Upload,
    desc: 'PDF, DOCX or TXT — we extract and analyze the text.',
  },
  {
    id: 'paste',
    label: 'Paste Notes',
    icon: FileText,
    desc: 'Drop in your own notes or copied material.',
  },
  {
    id: 'topic',
    label: 'Enter Topic',
    icon: Lightbulb,
    desc: 'Give a subject and we generate a lesson for you.',
  },
  {
    id: 'youtube',
    label: 'YouTube URL',
    icon: VideoIcon,
    desc: 'Paste a video link and we learn from its transcript.',
  },
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
      <p className="page-subtitle">
        Upload material or enter a topic — AI will analyze and build your learning path
      </p>

      <div className="source-cards">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              type="button"
              key={t.id}
              className={`source-card ${active ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="source-card__icon">
                <Icon size={22} />
              </span>
              <span className="source-card__label">{t.label}</span>
              <span className="source-card__desc">{t.desc}</span>
            </button>
          );
        })}
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
              <input
                type="text"
                value={form.title}
                onChange={update('title')}
                placeholder="e.g. Operating Systems Notes"
              />
            </div>
          </>
        )}

        {tab === 'paste' && (
          <>
            <div className="form-group">
              <label>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={update('title')}
                required
                placeholder="Session title"
              />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={form.content}
                onChange={update('content')}
                required
                rows={10}
                placeholder="Paste your study notes here..."
              />
            </div>
          </>
        )}

        {tab === 'topic' && (
          <div className="form-group">
            <label>Topic</label>
            <input
              type="text"
              value={form.topic}
              onChange={update('topic')}
              required
              placeholder="e.g. Operating System Deadlocks"
            />
          </div>
        )}

        {tab === 'youtube' && (
          <>
            <div className="form-group">
              <label>YouTube URL</label>
              <input
                type="url"
                value={form.url}
                onChange={update('url')}
                required
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
            <div className="form-group">
              <label>Title (optional)</label>
              <input
                type="text"
                value={form.title}
                onChange={update('title')}
                placeholder="Video title"
              />
            </div>
          </>
        )}

        {(tab === 'upload' || tab === 'youtube') && (
          <div className="form-group">
            <label>Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={update('subject')}
              placeholder="e.g. Computer Science"
            />
          </div>
        )}

        {tab === 'paste' && (
          <div className="form-group">
            <label>Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={update('subject')}
              placeholder="e.g. Computer Science"
            />
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <button type="submit" className="btn btn-primary session-submit" disabled={loading}>
          {loading ? 'Creating session...' : 'Create & Analyze with AI'}
        </button>
      </form>
    </div>
  );
}
