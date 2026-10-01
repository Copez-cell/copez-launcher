import { useState, useRef, useEffect } from 'react'

function TemplateDropdown({ value, options, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="template-dropdown" ref={ref}>
      <button
        className={`template-dropdown-trigger ${value ? 'has-value' : ''}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="template-dropdown-label">
          {value || placeholder || 'Select Template...'}
        </span>
        <svg
          className={`template-dropdown-arrow ${open ? 'open' : ''}`}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="template-dropdown-menu">
          {options.map((opt) => (
            <button
              key={opt}
              className={`template-dropdown-item ${opt === value ? 'active' : ''}`}
              onClick={() => {
                onChange(opt)
                setOpen(false)
              }}
              type="button"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default TemplateDropdown
