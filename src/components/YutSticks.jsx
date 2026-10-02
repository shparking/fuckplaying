import { yutName } from '../game/yut'

// 윷가락 4개. sticks[i] === true 면 배(평평한 면, X 무늬), false 면 등(둥근 면)
// 0번 윷가락의 배에는 빽도 표시
export function Sticks({ sticks, spinning, small }) {
  const s = sticks || [false, true, false, true]
  return (
    <div className={`sticks ${spinning ? 'spin' : ''} ${small ? 'small' : ''}`} aria-hidden>
      {s.map((flat, i) => (
        <span key={i} className={`stick ${flat ? 'flat' : 'round'} ${i === 0 ? 'back' : ''}`} style={{ '--i': i }}>
          {flat && (
            <>
              <i />
              <i />
              <i />
            </>
          )}
          {flat && i === 0 && <b className="back-mark" title="빽도 표시" />}
        </span>
      ))}
    </div>
  )
}

export const RESULT_TEXT = {
  '-1': '빽도! 뒤로 1칸',
  0: '낙! 마셔 🍶',
  1: '도! 1칸',
  2: '개! 2칸',
  3: '걸! 3칸',
  4: '윷! 4칸 · 한 번 더',
  5: '모! 5칸 · 한 번 더',
}

// 던지는 순간 모든 폰에 뜨는 윷 애니메이션
export function ThrowOverlay({ anim, who, teamColor }) {
  if (!anim) return null
  const spinning = anim.phase === 'spin'
  return (
    <div className={`throw-overlay ${spinning ? '' : 'shown'} ${anim.value === 0 ? 'nak' : ''}`}>
      <div className="throw-card" style={{ '--tc': teamColor }}>
        <div className="throw-who">{who} 🥢</div>
        {anim.value === 0 && !spinning ? <div className="throw-nak">🙈</div> : <Sticks sticks={spinning ? null : anim.sticks} spinning={spinning} />}
        <div className="throw-result">{spinning ? '…' : RESULT_TEXT[anim.value] || yutName(anim.value)}</div>
      </div>
    </div>
  )
}
