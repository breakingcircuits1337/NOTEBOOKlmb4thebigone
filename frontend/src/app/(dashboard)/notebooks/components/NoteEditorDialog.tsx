'use client'

import { Controller, useForm, useWatch } from 'react-hook-form'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import dynamic from 'next/dynamic'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateNote, useUpdateNote, useNote } from '@/lib/hooks/use-notes'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { InlineEdit } from '@/components/common/InlineEdit'
import { cn } from "@/lib/utils";
import { useTranslation } from '@/lib/hooks/use-translation'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const CODE_LANGUAGES = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'shell', label: 'Shell / Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'r', label: 'R' },
]

function parseCodeContent(content: string): { language: string; code: string } {
  const match = content.match(/^```(\w*)\n([\s\S]*)\n```$/)
  if (match) return { language: match[1] || 'plaintext', code: match[2] }
  return { language: 'plaintext', code: content }
}

function encodeCodeContent(language: string, code: string): string {
  return `\`\`\`${language}\n${code}\n\`\`\``
}

const createNoteSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
  language: z.string().optional(),
})

type CreateNoteFormData = z.infer<typeof createNoteSchema>

interface NoteEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notebookId: string
  note?: { id: string; title: string | null; content: string | null; note_type?: string | null }
  defaultNoteType?: 'human' | 'code_snippet'
}

export function NoteEditorDialog({ open, onOpenChange, notebookId, note, defaultNoteType = 'human' }: NoteEditorDialogProps) {
  const { t } = useTranslation()
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const queryClient = useQueryClient()
  const isEditing = Boolean(note)

  const effectiveNoteType = note?.note_type ?? defaultNoteType
  const isCodeSnippet = effectiveNoteType === 'code_snippet'

  // Ensure note ID has 'note:' prefix for API calls
  const noteIdWithPrefix = note?.id
    ? (note.id.includes(':') ? note.id : `note:${note.id}`)
    : ''

  const { data: fetchedNote, isLoading: noteLoading } = useNote(noteIdWithPrefix, { enabled: open && !!note?.id })
  const isSaving = isEditing ? updateNote.isPending : createNote.isPending
  const {
    handleSubmit,
    control,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<CreateNoteFormData>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: {
      title: '',
      content: '',
      language: 'plaintext',
    },
  })
  const watchTitle = useWatch({ control, name: 'title' })
  const watchLanguage = watch('language')
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false)

  useEffect(() => {
    if (!open) {
      reset({ title: '', content: '', language: 'plaintext' })
      return
    }

    const source = fetchedNote ?? note
    const title = source?.title ?? ''
    const rawContent = source?.content ?? ''

    if (isCodeSnippet && rawContent) {
      const { language, code } = parseCodeContent(rawContent)
      reset({ title, content: code, language })
    } else {
      reset({ title, content: rawContent, language: 'plaintext' })
    }
  }, [open, note, fetchedNote, reset, isCodeSnippet])

  useEffect(() => {
    if (!open) return

    const observer = new MutationObserver(() => {
      setIsEditorFullscreen(!!document.querySelector('.w-md-editor-fullscreen'))
    })
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [open])

  const onSubmit = async (data: CreateNoteFormData) => {
    const finalContent = isCodeSnippet
      ? encodeCodeContent(data.language || 'plaintext', data.content)
      : data.content

    if (note) {
      await updateNote.mutateAsync({
        id: noteIdWithPrefix,
        data: {
          title: data.title || undefined,
          content: finalContent,
        },
      })
      if (notebookId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notes(notebookId) })
      }
    } else {
      if (!notebookId) {
        console.error('Cannot create note without notebook_id')
        return
      }
      await createNote.mutateAsync({
        title: data.title || undefined,
        content: finalContent,
        note_type: isCodeSnippet ? 'code_snippet' : 'human',
        notebook_id: notebookId,
      })
    }
    reset()
    onOpenChange(false)
  }

  const handleClose = () => {
    reset()
    setIsEditorFullscreen(false)
    onOpenChange(false)
  }

  const monacoTheme = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'vs-dark'
    : 'light'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
          "sm:max-w-3xl w-full max-h-[90vh] overflow-hidden p-0",
          isEditorFullscreen && "!max-w-screen !max-h-screen border-none w-screen h-screen"
      )}>
        <DialogTitle className="sr-only">
          {isEditing
            ? (isCodeSnippet ? t.sources.editCodeSnippet : t.sources.editNote)
            : (isCodeSnippet ? t.sources.createCodeSnippet : t.sources.createNote)}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)} className="flex h-full flex-col">
          {isEditing && noteLoading ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <span className="text-sm text-muted-foreground">{t.common.loading}</span>
            </div>
          ) : (
            <>
              <div className="border-b px-6 py-4 space-y-3">
                <InlineEdit
                  id="note-title"
                  name="title"
                  value={watchTitle ?? ''}
                  onSave={(value) => setValue('title', value || '')}
                  placeholder={t.sources.addTitle}
                  emptyText={isCodeSnippet ? t.sources.untitledSnippet : t.sources.untitledNote}
                  className="text-xl font-semibold"
                  inputClassName="text-xl font-semibold"
                />
                {isCodeSnippet && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t.sources.language}:</span>
                    <Controller
                      control={control}
                      name="language"
                      render={({ field }) => (
                        <Select value={field.value ?? 'plaintext'} onValueChange={field.onChange}>
                          <SelectTrigger className="w-48 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CODE_LANGUAGES.map((lang) => (
                              <SelectItem key={lang.value} value={lang.value}>
                                {lang.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
              </div>

              <div className={cn(
                  "flex-1 overflow-hidden",
                  !isEditorFullscreen && !isCodeSnippet && "px-6 py-4")
              }>
                {isCodeSnippet ? (
                  <Controller
                    control={control}
                    name="content"
                    render={({ field }) => (
                      <MonacoEditor
                        height="420px"
                        language={watchLanguage ?? 'plaintext'}
                        value={field.value}
                        onChange={(value) => field.onChange(value ?? '')}
                        theme={monacoTheme}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          wordWrap: 'on',
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                        }}
                      />
                    )}
                  />
                ) : (
                  <Controller
                    control={control}
                    name="content"
                    render={({ field }) => (
                      <MarkdownEditor
                        key={note?.id ?? 'new'}
                        textareaId="note-content"
                        value={field.value}
                        onChange={field.onChange}
                        height={420}
                        placeholder={t.sources.writeNotePlaceholder}
                        className={cn(
                            "w-full h-full min-h-[420px] [&_.w-md-editor]:!static [&_.w-md-editor]:!w-full [&_.w-md-editor]:!h-full",
                            !isEditorFullscreen && "rounded-md border"
                        )}
                      />
                    )}
                  />
                )}
                {errors.content && (
                  <p className="text-sm text-red-600 mt-1 px-6">{errors.content.message}</p>
                )}
              </div>
            </>
          )}

          <div className="border-t px-6 py-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={isSaving || (isEditing && noteLoading)}
            >
              {isSaving
                ? isEditing ? `${t.common.saving}...` : `${t.common.creating}...`
                : isEditing
                  ? t.sources.saveNote
                  : (isCodeSnippet ? t.sources.createCodeSnippetBtn : t.sources.createNoteBtn)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
