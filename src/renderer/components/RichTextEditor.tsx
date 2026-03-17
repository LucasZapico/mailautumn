import { useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

export interface RichTextEditorHandle {
  getHTML: () => string;
  getText: () => string;
  focus: () => void;
  clear: () => void;
  setContent: (content: string) => void;
  insertContent: (content: string) => void;
}

interface Props {
  content?: string;
  placeholder?: string;
  className?: string;
  onUpdate?: (html: string, text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { content = '', placeholder = '', className = '', onUpdate, onFocus, onBlur, onSubmit, autoFocus },
  ref,
) {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable heading levels we don't need in email
        heading: { levels: [1, 2, 3] },
        // Code blocks with triple backtick
        codeBlock: { HTMLAttributes: { class: 'email-code-block' } },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editorProps: {
      attributes: {
        class: `prose-editor outline-none ${className}`,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSubmitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      onUpdate?.(e.getHTML(), e.getText());
    },
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  });

  useEffect(() => {
    if (autoFocus && editor) {
      setTimeout(() => editor.commands.focus('end'), 100);
    }
  }, [autoFocus, editor]);

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() || '',
    getText: () => editor?.getText() || '',
    focus: () => editor?.commands.focus('end'),
    clear: () => editor?.commands.clearContent(),
    setContent: (c: string) => editor?.commands.setContent(c),
    insertContent: (c: string) => editor?.commands.insertContent(c),
  }), [editor]);

  if (!editor) return null;

  return <EditorContent editor={editor} />;
});

export default RichTextEditor;
