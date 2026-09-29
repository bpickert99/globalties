import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

export type MapPoint = { id: string; lat: number; lng: number; color: string; label: string; number?: number }

const KANSAS_CITY: L.LatLngExpression = [39.0997, -94.5786]

function icon(p: MapPoint, selected: boolean): L.DivIcon {
  const size = selected ? 30 : 22
  return L.divIcon({
    className: '',
    html: `<div class="pin${selected ? ' selected' : ''}" style="background:${p.color};width:${size}px;height:${size}px">${p.number ?? ''}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Leaflet map of resource pins. In pick mode, a click reports the coordinates instead.
export default function MapView({
  points,
  selectedId,
  onSelect,
  picking,
  onPick,
}: {
  points: MapPoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  picking: boolean
  onPick: (lat: number, lng: number) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const pickRef = useRef({ picking, onPick })
  pickRef.current = { picking, onPick }

  useEffect(() => {
    const m = L.map(el.current!).setView(KANSAS_CITY, 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Geocoding by Nominatim',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (pickRef.current.picking) pickRef.current.onPick(e.latlng.lat, e.latlng.lng)
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  // Redraw pins; refit the view only when the set of pins changes.
  const pinKey = points.map((p) => p.id).join(',')
  useEffect(() => {
    const m = map.current!
    if (points.length === 1) m.setView([points[0].lat, points[0].lng], 14)
    else if (points.length > 1) m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 14 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey])

  useEffect(() => {
    const group = layer.current!
    group.clearLayers()
    for (const p of points) {
      L.marker([p.lat, p.lng], { icon: icon(p, p.id === selectedId), zIndexOffset: p.id === selectedId ? 1000 : 0 })
        .bindTooltip(p.label)
        .on('click', () => onSelect(p.id))
        .addTo(group)
    }
  }, [points, selectedId, onSelect])

  useEffect(() => {
    const p = points.find((x) => x.id === selectedId)
    if (p) map.current!.panTo([p.lat, p.lng])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // React owns the wrapper's classes; Leaflet owns the inner element's (re-rendering it would wipe them).
  return (
    <div className={picking ? 'map picking' : 'map'}>
      <div ref={el} className="map-canvas" />
    </div>
  )
}
