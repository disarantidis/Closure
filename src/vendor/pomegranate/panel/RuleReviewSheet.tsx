import { useMemo, useState } from 'react'
import type { Analysis } from '../doc/analyze.ts'
import { evaluateTypographyRules, type TypographyRule } from '../doc/typographyRules.ts'
import { Button } from './node/Button'
import { ConfirmIcon, DismissIcon } from './node/Icon'
import { TextField } from './node/TextField'
import { ListItem } from './node/ListItem'
import { Badge } from './node/Badge'

/*
  RuleReviewSheet — candidate rules, one at a time, with a live preview.

  A candidate is not a finding: it is a CLAIM about the token graph ("every level's family
  starts with GT Ultra") that nobody has checked yet. This sheet runs that one claim against
  the live analysis right now — the same evaluator the accepted rules run through — so the
  decision to accept is made against evidence, not the rule's prose alone. Accepting moves it
  into `book.rules` (enforced from then on); rejecting moves it into `book.rejected` (so it
  isn't silently re-proposed later without a human seeing why it was turned down).

  Always shows candidates[0] — the caller removes an item from the array the moment it's
  decided, so the sheet never needs its own cursor to fall out of sync with the book.
*/
const SevDot = ({ severity }: { severity: string }) => (
  <span data-scheme={severity} style={{ display: 'inline-flex' }}>
    <Badge variant="primary" label={severity} />
  </span>
)

function ruleSummary(r: TypographyRule): string {
  switch (r.kind) {
    case 'family-locked':
      return `every level's font-family must start with “${r.mustStartWith}”`
    case 'weight-locked':
      return `every level's weight must resolve to one of ${r.allow.join(' / ')}`
    case 'size-scale-only':
      return `every level's size must trace back to ${r.scalePrefix}*`
    case 'pair-identical':
      return `${r.a} and ${r.b} must resolve byte-identical on ${(r.axes ?? ['size', 'weight', 'line-height', 'letter-spacing', 'font-family']).join(', ')}`
    case 'level-retired':
      return `${r.levels.join(', ')} must not exist in the ladder at all`
    case 'pair-weight-order':
      return 'weight must never increase from a composition’s primary text to its secondary'
  }
}

export function RuleReviewSheet({
  candidates,
  analysis,
  onAccept,
  onReject,
  onJump,
  onClose,
}: {
  candidates: TypographyRule[]
  analysis: Analysis
  onAccept: (rule: TypographyRule) => void
  onReject: (rule: TypographyRule, reason: string) => void
  onJump?: (set: string, path: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const current = candidates[0] ?? null
  const total = candidates.length

  const findings = useMemo(() => (current ? evaluateTypographyRules([current], analysis) : []), [current, analysis])

  const decide = (accept: boolean) => {
    if (!current) return
    if (accept) onAccept(current)
    else onReject(current, reason.trim())
    setReason('')
  }

  return (
    <>
      <div className="value-sheet-backdrop" onClick={onClose} />
      <aside className="rule-review" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <header className="vs-head">
          <div className="vs-title">
            <span className="ntl-name">✎ typography rules — review</span>
            <span className="ntl-engine">
              each rule is checked against the live token graph before you decide
              {total > 0 && <span className="rr-progress">{total} candidate{total === 1 ? '' : 's'} left</span>}
            </span>
          </div>
          <Button variant="ghost" kind="icon-button" size="small" glass={false} label="Close" leading={<DismissIcon />} onClick={onClose} />
        </header>

        {!current ? (
          <div className="rr-done">
            <span>nothing left to review</span>
            <span className="panel-note">new candidates show up here as they're proposed</span>
          </div>
        ) : (
          <>
            <div className="rr-body">
              <div>
                <span className="rr-rule-id">{current.id}</span>
                <span className="rr-kind">{current.kind}</span>
              </div>
              <div>{ruleSummary(current)}</div>
              {current.source && <div className="rr-source">“{current.source}”</div>}

              <div>
                <div className="rr-section-label">
                  right now, this rule would flag {findings.length} place{findings.length === 1 ? '' : 's'}
                </div>
                <div className="rr-preview-list">
                  {findings.slice(0, 20).map((f, i) => (
                    <ListItem
                      key={i}
                      title={f.label}
                      subtitle={f.detail}
                      leading={<SevDot severity={f.severity} />}
                      trailing={
                        f.pick ? (
                          <span style={{ maxInlineSize: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.pick.set} · {f.pick.path}
                          </span>
                        ) : undefined
                      }
                      onClick={f.pick && onJump ? () => onJump(f.pick!.set, f.pick!.path) : undefined}
                    />
                  ))}
                  {findings.length === 0 && <div className="panel-note">clean — nothing in the file breaks this rule today</div>}
                  {findings.length > 20 && <div className="panel-note">+{findings.length - 20} more</div>}
                </div>
              </div>

              <div className="rr-reject-row">
                <TextField label="Reason (optional, only used if rejecting)" placeholder="why this rule shouldn't be enforced…" value={reason} onChange={setReason} />
              </div>
            </div>

            <div className="rr-actions">
              <Button variant="ghost" size="small" glass={false} leading={<DismissIcon />} onClick={() => decide(false)}>
                Reject
              </Button>
              <span className="rr-spacer" />
              <Button variant="primary" size="small" leading={<ConfirmIcon />} onClick={() => decide(true)}>
                Accept — start enforcing
              </Button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
