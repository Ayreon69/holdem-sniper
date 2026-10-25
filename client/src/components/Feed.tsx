// Journal de la partie + chat + réactions rapides.
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EMOTES, type LogEntry, type RoomView } from '../../../shared/protocol';
import { cls } from '../lib/util';
import { send, socket } from '../net';

const KIND_ICON: Partial<Record<LogEntry['kind'], string>> = {
  hand: '🂠',
  win: '🏆',
  survive: '✨',
  eliminate: '☠',
  gift: '🎁',
};

export function Feed({ view }: { view: RoomView }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const last = view.log[view.log.length - 1]?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await send('chat', { text: t });
  };

  return (
    <div className="feed">
      <div className="feed-list" ref={listRef}>
        {view.log.map((l) => (
          <div key={l.id} className={cls('feed-item', `is-${l.kind}`, l.playerId === view.me && 'is-mine')}>
            {KIND_ICON[l.kind] && <span className="feed-ico">{KIND_ICON[l.kind]}</span>}
            <span>{l.text}</span>
          </div>
        ))}
      </div>
      <div className="emote-bar">
        {EMOTES.map((e) => (
          <button key={e} type="button" className="emote-btn" onClick={() => socket.emit('emote', { emoji: e })} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input className="input" placeholder="Un message pour la table…" value={text} maxLength={160} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="icon-btn is-accent" aria-label="Envoyer">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
