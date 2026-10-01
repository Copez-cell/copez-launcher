function isConfigured(url, key) {
  return url && key && !url.includes('placeholder') && !key.includes('placeholder')
}

function buildMock() {
  const noop = () => Promise.resolve({ data: { session: null }, error: null })
  const storageNoop = () => Promise.resolve({ data: null, error: null })
  return {
    auth: {
      getSession: noop,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: noop,
      signInWithPassword: noop,
      signOut: noop,
      updateUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
    storage: {
      from: () => ({
        upload: storageNoop,
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    from: () => ({
      select: () => ({ then: noop, eq: () => ({ then: noop }) }),
      upsert: () => ({ then: noop, catch: () => {} }),
    }),
  }
}

let supabase = buildMock()
let readyResolve
const readyPromise = new Promise((resolve) => { readyResolve = resolve })
let ready = false

function getReadyPromise() { return readyPromise }

try {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (isConfigured(supabaseUrl, supabaseAnonKey)) {
    import('@supabase/supabase-js').then(({ createClient }) => {
      supabase = createClient(supabaseUrl, supabaseAnonKey)
      ready = true
      readyResolve()
    }).catch(() => {
      ready = true
      readyResolve()
    })
  } else {
    ready = true
    readyResolve()
  }
} catch {
  ready = true
  readyResolve()
}

export { supabase, getReadyPromise }
