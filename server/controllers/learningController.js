import mongoose from 'mongoose';
import LearningSession from '../models/LearningSession.js';
import { extractTextFromFile, truncateContent, cleanContent } from '../ai/utils/fileParser.js';
import { runContentAnalysis } from '../ai/langgraph/graph.js';
import { fetchYouTubeTranscript } from '../ai/utils/youtubeTranscript.js';

async function analyzeSession(session, content, mode = 'analyze') {
  try {
    console.log('[DEBUG analyzeSession] received content length =', content ? content.length : 0);
    console.log('[DEBUG analyzeSession] first 300 chars =\n', (content || '').slice(0, 300));
    session.analysisStatus = 'processing';
    session.analysisError = undefined;
    await session.save();

    const analysisPromise = runContentAnalysis({
      session,
      content: truncateContent(content),
      mode,
    })
      .then((result) => ({ result }))
      .catch((error) => ({ error }));

    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), 60000)
    );

    const response = await Promise.race([analysisPromise, timeoutPromise]);

    if (response.timedOut) {
      session.analysisStatus = 'failed';
      session.analysisError = 'Analysis timed out. Please retry.';
      await session.save();
      return;
    }

    if (response.error) {
      throw response.error;
    }

    const result = response.result;
    const analysis = result.analysis || {};
    const topics = Array.isArray(analysis.topics) ? analysis.topics : [];
    const learningObjectives = Array.isArray(analysis.learningObjectives)
      ? analysis.learningObjectives
      : [];
    const keywords = Array.isArray(analysis.keywords) ? analysis.keywords : [];

    session.title = analysis.title || session.title;
    session.subject = analysis.subject || session.subject;
    session.summary = analysis.summary || '';
    session.difficulty =
      analysis.difficulty || session.difficulty || 'Intermediate';
    session.estimatedTime =
      analysis.estimatedStudyTime || analysis.estimatedTime || session.estimatedTime || '1 Hour';
    session.learningObjectives = learningObjectives;
    session.keywords = keywords;
    session.topics = topics;
    session.analysisStatus = 'completed';
    session.analysisError = undefined;
    await session.save();
  } catch (err) {
    session.analysisStatus = 'failed';
    session.analysisError = err.message;
    await session.save();
  }
}

export async function uploadContent(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const title = req.body.title || req.file.originalname;
    const subject = req.body.subject || 'General';

    let content = '';
    try {
      content = await extractTextFromFile(req.file.path, req.file.originalname);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    // Strip noise (page numbers, dup lines, blank lines) before storing/sending.
    content = cleanContent(content);

    const session = await LearningSession.create({
      user: req.userId,
      title,
      subject,
      sourceType: 'upload',
      sourceContent: truncateContent(content),
      filePath: req.file.path,
      fileName: req.file.originalname,
      analysisStatus: 'processing',
      analysisError: undefined,
    });

    analyzeSession(session, content, 'analyze');

    res.status(201).json({ session, message: 'Upload successful. AI analysis in progress.' });
  } catch (err) {
    next(err);
  }
}

export async function createFromPaste(req, res, next) {
  try {
    const { title, subject, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const cleaned = cleanContent(content);

    const session = await LearningSession.create({
      user: req.userId,
      title,
      subject: subject || 'General',
      sourceType: 'paste',
      sourceContent: truncateContent(cleaned),
      analysisStatus: 'processing',
      analysisError: undefined,
    });

    analyzeSession(session, cleaned, 'analyze');

    res.status(201).json({ session, message: 'Notes saved. AI analysis in progress.' });
  } catch (err) {
    next(err);
  }
}

export async function createFromTopic(req, res, next) {
  try {
    const { topic, subject } = req.body;

    if (!topic) {
      return res.status(400).json({ message: 'Topic is required' });
    }

    const content = `Study material topic: ${topic}. Subject area: ${subject || 'General'}. 
Generate comprehensive learning content covering key concepts, definitions, examples, and common interview questions for this topic.`;

    const session = await LearningSession.create({
      user: req.userId,
      title: topic,
      subject: subject || 'General',
      sourceType: 'topic',
      sourceContent: content,
      analysisStatus: 'processing',
      analysisError: undefined,
    });

    analyzeSession(session, content, 'generate');

    res.status(201).json({ session, message: 'Topic session created. AI analysis in progress.' });
  } catch (err) {
    next(err);
  }
}

export async function createFromYoutube(req, res, next) {
  try {
    const { url, title, subject } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'YouTube URL is required' });
    }

    // Fetch the ACTUAL transcript for the video. If we cannot retrieve it we
    // must not fall back to generating content from the title — that is what
    // produced unrelated lessons (e.g. a Linked List video analysed as DFS).
    let transcript;
    try {
      const result = await fetchYouTubeTranscript(url);
      transcript = cleanContent(result.transcript);
    } catch (transcriptErr) {
      return res.status(422).json({
        message: `Could not use this YouTube video: ${transcriptErr.message} You can still learn from it by pasting the transcript or notes into the Paste Notes tab.`,
      });
    }

    const sessionTitle = title || 'YouTube Learning Session';

    const session = await LearningSession.create({
      user: req.userId,
      title: sessionTitle,
      subject: subject || 'General',
      sourceType: 'youtube',
      sourceContent: transcript,
      analysisStatus: 'processing',
      analysisError: undefined,
    });

    analyzeSession(session, transcript, 'analyze');

    res.status(201).json({ session, message: 'YouTube transcript retrieved. AI analysis in progress.' });
  } catch (err) {
    next(err);
  }
}

export async function getSessions(req, res, next) {
  try {
    const sessions = await LearningSession.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .select('-sourceContent');
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

export async function getSession(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Session not found' });
    }
    const session = await LearningSession.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({ session });
  } catch (err) {
    next(err);
  }
}

export async function reanalyzeSession(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Session not found' });
    }
    const session = await LearningSession.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const content = session.sourceContent;
    if (!content) {
      return res.status(400).json({ message: 'No content to analyze' });
    }

    session.analysisStatus = 'processing';
    session.analysisError = undefined;
    await session.save();

    analyzeSession(session, content);
    res.json({ message: 'Re-analysis started', session });
  } catch (err) {
    next(err);
  }
}
