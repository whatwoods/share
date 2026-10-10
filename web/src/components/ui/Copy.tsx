import { Check, Copy as CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';

/** 复制到剪贴板（用于生成催办文本、对账摘要） */
export function CopyButton({ text, label = '复制', title }: { text: string | (() => string); label?: string; title?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const t = typeof text === 'function' ? text() : text;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <Button variant="ghost" size="sm" onClick={copy} title={title} icon={done ? <Check className="text-good" /> : <CopyIcon />}>
      {done ? '已复制' : label}
    </Button>
  );
}
