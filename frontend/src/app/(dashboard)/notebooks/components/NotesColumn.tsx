'use client'

import { useState, useMemo } from 'react'
import { NoteResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, StickyNote, Bot, User, Code2, MoreVertical, Trash2, ChevronDown } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { NoteEditorDialog } from './NoteEditorDialog'
import { getDateLocale } from '@/lib/utils/date-locale'
import { formatDistanceToNow } from 'date-fns'
import { ContextToggle } from '@/components/common/ContextToggle'
import { ContextMode } from '../[id]/page'
import { useDeleteNote } from '@/lib/hooks/use-notes'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CollapsibleColumn, createCollapseButton } from '@/components/notebooks/CollapsibleColumn'
import { useNotebookColumnsStore } from '@/lib/stores/notebook-columns-store'
import { useTranslation } from '@/lib/hooks/use-translation'

interface NotesColumnProps {
  notes?: NoteResponse[]
  isLoading: boolean
  notebookId: string
  contextSelections?: Record<string, ContextMode>
  onContextModeChange?: (noteId: string, mode: ContextMode) => void
}

function parseCodeLanguage(content: string | null): string {
  if (!content) return ''
  const match = content.match(/^```(\w+)/)
  return match ? match[1] : ''
}

function parseCodeBody(content: string | null): string {
  if (!content) return ''
  const match = content.match(/^```\w*\n([\s\S]*)\n```$/)
  return match ? match[1] : content
}

export function NotesColumn({
  notes,
  isLoading,
  notebookId,
  contextSelections,
  onContextModeChange
}: NotesColumnProps) {
  const { t, language } = useTranslation()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [defaultNoteType, setDefaultNoteType] = useState<'human' | 'code_snippet'>('human')
  const [editingNote, setEditingNote] = useState<NoteResponse | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null)

  const deleteNote = useDeleteNote()

  // Collapsible column state
  const { notesCollapsed, toggleNotes } = useNotebookColumnsStore()
  const collapseButton = useMemo(
    () => createCollapseButton(toggleNotes, t.common.notes),
    [toggleNotes, t.common.notes]
  )

  const handleDeleteClick = (noteId: string) => {
    setNoteToDelete(noteId)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!noteToDelete) return

    try {
      await deleteNote.mutateAsync(noteToDelete)
      setDeleteDialogOpen(false)
      setNoteToDelete(null)
    } catch (error) {
      console.error('Failed to delete note:', error)
    }
  }

  const openAddDialog = (type: 'human' | 'code_snippet') => {
    setDefaultNoteType(type)
    setEditingNote(null)
    setShowAddDialog(true)
  }

  return (
    <>
      <CollapsibleColumn
        isCollapsed={notesCollapsed}
        onToggle={toggleNotes}
        collapsedIcon={StickyNote}
        collapsedLabel={t.common.notes}
      >
        <Card className="h-full flex flex-col flex-1 overflow-hidden">
          <CardHeader className="pb-3 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">{t.common.notes}</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex">
                  <Button
                    size="sm"
                    className="rounded-r-none"
                    onClick={() => openAddDialog('human')}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t.common.writeNote}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="rounded-l-none border-l border-l-primary-foreground/20 px-2">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openAddDialog('human')}>
                        <User className="h-4 w-4 mr-2" />
                        {t.common.writeNote}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAddDialog('code_snippet')}>
                        <Code2 className="h-4 w-4 mr-2" />
                        {t.common.addCodeSnippet}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {collapseButton}
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : !notes || notes.length === 0 ? (
              <EmptyState
                icon={StickyNote}
                title={t.notebooks.noNotesYet}
                description={t.sources.createFirstNote}
              />
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 border rounded-lg card-hover group relative cursor-pointer"
                    onClick={() => setEditingNote(note)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {note.note_type === 'ai' ? (
                          <Bot className="h-4 w-4 text-primary" />
                        ) : note.note_type === 'code_snippet' ? (
                          <Code2 className="h-4 w-4 text-blue-500" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {note.note_type === 'ai'
                            ? t.common.aiGenerated
                            : note.note_type === 'code_snippet'
                            ? (parseCodeLanguage(note.content) || t.common.codeSnippet)
                            : t.common.human}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(note.updated), {
                            addSuffix: true,
                            locale: getDateLocale(language)
                          })}
                        </span>

                        {/* Context toggle - only show if handler provided */}
                        {onContextModeChange && contextSelections?.[note.id] && (
                          <div onClick={(event) => event.stopPropagation()}>
                            <ContextToggle
                              mode={contextSelections[note.id]}
                              hasInsights={false}
                              onChange={(mode) => onContextModeChange(note.id, mode)}
                            />
                          </div>
                        )}

                        {/* Ellipsis menu for delete action */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteClick(note.id)
                              }}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t.notebooks.deleteNote}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {note.title && (
                      <h4 className="text-sm font-medium mb-2">{note.title}</h4>
                    )}

                    {note.content && (
                      note.note_type === 'code_snippet' ? (
                        <p className="text-xs text-muted-foreground line-clamp-3 font-mono bg-muted/50 rounded px-2 py-1">
                          {parseCodeBody(note.content)}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {note.content}
                        </p>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleColumn>

      <NoteEditorDialog
        open={showAddDialog || Boolean(editingNote)}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false)
            setEditingNote(null)
          } else {
            setShowAddDialog(true)
          }
        }}
        notebookId={notebookId}
        note={editingNote ?? undefined}
        defaultNoteType={defaultNoteType}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t.notebooks.deleteNote}
        description={t.notebooks.deleteNoteConfirm}
        confirmText={t.common.delete}
        onConfirm={handleDeleteConfirm}
        isLoading={deleteNote.isPending}
        confirmVariant="destructive"
      />
    </>
  )
}
