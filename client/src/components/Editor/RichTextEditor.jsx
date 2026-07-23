import React, { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import api from '../../api/client.js'

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

/**
 * Split any <br>-separated lines inside a <p> into standalone paragraph blocks.
 *
 * Block-level formatting (headings, quotes, etc.) applies to a whole block. If
 * several visual "lines" live inside one <p> joined by <br>, toggling a heading
 * on one line converts the entire block. Turning each line into its own <p>
 * makes them individually formattable. Renders identically (empty <p> keeps the
 * blank line via the CSS in index.css) and is idempotent — content with no <br>
 * is returned unchanged.
 */
export function normalizeLineBreaks(html) {
  if (!html || typeof window === 'undefined' || !/<br/i.test(html)) return html

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  doc.body.querySelectorAll('p').forEach((p) => {
    if (!p.querySelector('br')) return

    // Group the paragraph's child nodes into segments split at each <br>.
    const segments = [[]]
    p.childNodes.forEach((node) => {
      if (node.nodeName === 'BR') segments.push([])
      else segments[segments.length - 1].push(node)
    })

    const frag = doc.createDocumentFragment()
    segments.forEach((nodes) => {
      const np = doc.createElement('p')
      nodes.forEach((n) => np.appendChild(n)) // moves node out of the old <p>
      frag.appendChild(np)
    })
    p.replaceWith(frag)
  })

  return doc.body.innerHTML
}

export default function RichTextEditor({ content, onChange }) {
  const [uploadError, setUploadError] = useState('')

  // Clear upload error after 5 seconds
  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [uploadError])

  const validateImageFile = (file) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file')
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size is 10MB.`)
      return false
    }
    return true
  }

  const uploadImage = async (file) => {
    if (!validateImageFile(file)) return null

    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      return response.data.url
    } catch (error) {
      console.error('Image upload failed:', error)
      setUploadError(error.response?.data?.message || 'Failed to upload image')
      return null
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
        codeBlock: true,
        blockquote: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
    ],
    content: normalizeLineBreaks(content || ''),
    editorProps: {
      // Pasted HTML often uses <br> to separate lines; split them into real
      // paragraphs so each pasted line stays independently formattable.
      transformPastedHTML: (html) => normalizeLineBreaks(html),
      // NOTE: ProseMirror expects these handlers to return a synchronous
      // boolean. Returning a Promise (async fn) is treated as truthy, which
      // silently swallows non-image pastes/drops. Keep the function sync;
      // fire image uploads asynchronously without awaiting.
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            const insertPos = view.state.selection.from
            uploadImage(file).then((url) => {
              if (!url) return
              const { schema } = view.state
              const node = schema.nodes.image.create({ src: url })
              const transaction = view.state.tr.insert(insertPos, node)
              view.dispatch(transaction)
            })
            return true
          }
        }
        return false
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        if (!files || !files.length) return false

        for (const file of files) {
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })
            uploadImage(file).then((url) => {
              if (!url || !coordinates) return
              const { schema } = view.state
              const node = schema.nodes.image.create({ src: url })
              const transaction = view.state.tr.insert(coordinates.pos, node)
              view.dispatch(transaction)
            })
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML())
      }
    },
  })

  // Sync external content changes into the editor. Normalize <br>-joined lines
  // into paragraphs, and only reset when the editor is NOT focused so live
  // typing (which triggers onChange -> content) never resets the cursor.
  useEffect(() => {
    if (!editor || content === undefined) return
    const normalized = normalizeLineBreaks(content || '')
    if (!editor.isFocused && editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized)
    }
  }, [content, editor])

  if (!editor) {
    return <div className="border border-gray-300 rounded-lg min-h-[400px] p-6 bg-gray-50 animate-pulse" />
  }

  const handleImageUpload = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file || !validateImageFile(file)) return

      const url = await uploadImage(file)
      if (url) {
        editor.chain().focus().setImage({ src: url }).run()
      }
    }
    input.click()
  }

  const toggleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
    } else {
      const url = window.prompt('Enter URL')
      if (url) {
        editor.chain().focus().setLink({ href: url }).run()
      }
    }
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Upload Error Message */}
      {uploadError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
          <p className="text-red-600 text-sm">{uploadError}</p>
          <button type="button" onClick={() => setUploadError('')} className="text-red-400 hover:text-red-600 ml-2">×</button>
        </div>
      )}

      {/* Editor Toolbar */}
      <div className="bg-gray-50 border-b border-gray-300 px-4 py-2 flex gap-1.5 flex-wrap">
        <ToolbarButton editor={editor} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} disabled={!editor.can().toggleBold()}>B</ToolbarButton>

        <ToolbarButton editor={editor} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} disabled={!editor.can().toggleItalic()}>I</ToolbarButton>

        <ToolbarButton editor={editor} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} disabled={!editor.can().toggleStrike()}><s>S</s></ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <ToolbarButton editor={editor} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
        <ToolbarButton editor={editor} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
        <ToolbarButton editor={editor} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <ToolbarButton editor={editor} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><span className="mr-0.5">•</span>List</ToolbarButton>
        <ToolbarButton editor={editor} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <ToolbarButton editor={editor} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</ToolbarButton>
        <ToolbarButton editor={editor} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code</ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <button type="button" onClick={handleImageUpload} className="px-2.5 py-1 text-sm rounded transition-colors bg-white hover:bg-gray-100 border border-gray-300">🖼 Image</button>
        <ToolbarButton editor={editor} active={editor.isActive('link')} onClick={toggleLink}>🔗 Link</ToolbarButton>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <ToolbarButton editor={editor} active={!editor.isActive('heading') && !editor.isActive('codeBlock')} onClick={() => editor.chain().focus().setParagraph().run()}>Paragraph</ToolbarButton>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className="px-2.5 py-1 text-sm rounded transition-colors bg-white hover:bg-gray-100 border border-gray-300">Clear</button>
      </div>

      {/* Editor Content — free writing surface */}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({ active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 text-sm rounded transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-white hover:bg-gray-100 border border-gray-300'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}
