import { useAtomValue } from 'jotai';
import {
  IoCodeSlashOutline, IoListOutline, IoLinkOutline,
} from 'react-icons/io5';
import { LuQuote } from 'react-icons/lu';
import { showFormattingToolbarAtom } from '../atoms/app';
import type { Editor } from '@tiptap/react';

interface Props {
  editor: Editor | null;
}

export default function FormattingToolbar({ editor }: Props) {
  const show = useAtomValue(showFormattingToolbarAtom);
  if (!show || !editor) return null;

  const btn = (active: boolean) =>
    `p-1.5 rounded-md transition-colors cursor-pointer ${
      active
        ? 'text-accent bg-accent/10'
        : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
    }`;

  return (
    <div className="flex items-center gap-0.5">
      <button
        className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Cmd+B)"
      >
        <span className="text-xs font-bold">B</span>
      </button>
      <button
        className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Cmd+I)"
      >
        <span className="text-xs italic font-medium">I</span>
      </button>
      <button
        className={btn(editor.isActive('code'))}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline code (Cmd+E)"
      >
        <IoCodeSlashOutline size={14} />
      </button>
      <div className="w-px h-4 bg-border-primary mx-1" />
      <button
        className={btn(editor.isActive('link'))}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run();
          } else {
            const url = window.prompt('URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }
        }}
        title="Link"
      >
        <IoLinkOutline size={14} />
      </button>
      <button
        className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <IoListOutline size={14} />
      </button>
      <button
        className={btn(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        <LuQuote size={13} />
      </button>
    </div>
  );
}
