import React, { useState, useEffect, useRef } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { getFirestoreDb } from '../../services/firebaseApp';

export interface FeedbackContext {
  personId?: string;
  personName?: string;
  role?: string;
  orgId?: string;
  orgName?: string;
  ecosystemId?: string;
  currentView?: string;
}

interface FeedbackWidgetProps {
  context: FeedbackContext;
}

const saveFeedback = async (text: string, context: FeedbackContext) => {
  const db = getFirestoreDb();
  const payload = {
    text,
    created_at: new Date().toISOString(),
    person_id: context.personId || null,
    person_name: context.personName || null,
    role: context.role || null,
    org_id: context.orgId || null,
    org_name: context.orgName || null,
    ecosystem_id: context.ecosystemId || null,
    current_view: context.currentView || null,
    url: window.location.href,
    screen_width: window.innerWidth,
    screen_height: window.innerHeight,
    user_agent: navigator.userAgent,
  };

  if (db) {
    await addDoc(collection(db, 'feedback'), payload);
  } else {
    // Fallback: log to console in demo/local mode
    console.info('[Feedback submitted]', payload);
  }
};

export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({ context }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeDismissed = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Show the nudge bubble after 25s if the user hasn't opened it
  useEffect(() => {
    nudgeTimer.current = setTimeout(() => {
      if (!nudgeDismissed.current && !isOpen) {
        setShowNudge(true);
      }
    }, 25000);
    return () => { if (nudgeTimer.current) clearTimeout(nudgeTimer.current); };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShowNudge(false);
      nudgeDismissed.current = true;
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleDismissNudge = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowNudge(false);
    nudgeDismissed.current = true;
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setStatus('saving');
    try {
      await saveFeedback(text.trim(), context);
      setStatus('done');
      setText('');
      setTimeout(() => {
        setStatus('idle');
        setIsOpen(false);
      }, 2000);
    } catch (err) {
      console.error('Feedback save failed:', err);
      setStatus('error');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex flex-col items-end gap-2">
      {/* Nudge bubble */}
      {showNudge && !isOpen && (
        <div className="relative bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 max-w-[220px] text-sm text-gray-700 animate-in slide-in-from-bottom-2 fade-in">
          <button
            onClick={handleDismissNudge}
            className="absolute top-1.5 right-2 text-gray-300 hover:text-gray-500 text-xs leading-none"
          >
            ×
          </button>
          <p className="font-medium text-gray-800 mb-0.5">Got feedback?</p>
          <p className="text-xs text-gray-500">Tap the button below to share thoughts, bugs, or ideas.</p>
          {/* Triangle pointer */}
          <div className="absolute -bottom-2 right-5 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white drop-shadow-sm" />
        </div>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl w-80 animate-in slide-in-from-bottom-2 fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-800">Share Feedback</p>
              <p className="text-xs text-gray-400">Bugs, ideas, or anything on your mind.</p>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-300 hover:text-gray-500 text-xl leading-none ml-2">×</button>
          </div>

          <div className="p-4 space-y-3">
            {status === 'done' ? (
              <div className="text-center py-4">
                <div className="text-2xl mb-1">✓</div>
                <p className="text-sm font-medium text-gray-700">Got it, thanks!</p>
                <p className="text-xs text-gray-400">Your feedback helps us improve.</p>
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 focus:outline-none resize-none"
                  rows={4}
                  placeholder="What happened? What would you expect? Any ideas?"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSubmit(); }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-300">
                    {context.currentView && `View: ${context.currentView}`}
                  </span>
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={!text.trim() || status === 'saving'}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    {status === 'saving' ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {status === 'error' && (
                  <p className="text-xs text-red-500">Could not save — check your connection and try again.</p>
                )}
                <p className="text-[10px] text-gray-300 text-right">⌘↵ to send</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full shadow-lg transition-all hover:shadow-xl"
      >
        <span className="text-base leading-none">💬</span>
        <span>Feedback</span>
      </button>
    </div>
  );
};
