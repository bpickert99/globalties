import type { Block, Line, Seg } from '../itineraryItem'

// How one schedule item will read on the Word itinerary (same blocks as the export).

function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => {
        const node = s.bold ? <b>{s.text}</b> : s.text
        return <span key={i}>{s.italic ? <i>{node}</i> : node}</span>
      })}
    </>
  )
}

const Lines = ({ lines }: { lines: Line[] }) => (
  <div>
    {lines.map((l, i) => (
      <div key={i}>
        <Segs segs={l} />
      </div>
    ))}
  </div>
)

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'head':
      return (
        <div className="ip-row">
          <b className="ip-label">{block.time}</b>
          <b>{block.title}</b>
        </div>
      )
    case 'note':
      return <i>{block.text}</i>
    case 'field':
      return (
        <div className="ip-row">
          <span className="ip-label">{block.boldLabel ? <b>{block.label}</b> : block.label}</span>
          <Lines lines={block.lines} />
        </div>
      )
    case 'more':
      return (
        <div className="ip-row">
          <span className="ip-label" />
          <Lines lines={block.lines} />
        </div>
      )
    case 'aside':
      return (
        <div className="ip-aside">
          <Segs segs={block.segs} />
        </div>
      )
    case 'para':
      return (
        <div className="ip-para">
          <Lines lines={block.lines} />
        </div>
      )
    case 'box':
      return (
        <div className="ip-box">
          {block.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      )
  }
}

export default function ItineraryPreview({ blocks }: { blocks: Block[] }) {
  return (
    <aside className="itinerary-preview" aria-label="Itinerary preview">
      <div className="muted small">On the itinerary</div>
      <div className="ip-page">
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
      </div>
    </aside>
  )
}
