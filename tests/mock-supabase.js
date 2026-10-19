// In-browser fake of the subset of supabase-js IndexCards uses, for e2e tests.
// The "server" lives in localStorage['mock-sb-db'] so tests can inspect it or
// copy it into a second browser context to simulate another device.
(() => {
  const DB_KEY = 'mock-sb-db';
  const SESSION_KEY = 'mock-sb-session';
  const load = () => JSON.parse(localStorage.getItem(DB_KEY) || '{"users":[],"sets":[],"clock":0}');
  const save = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
  const tick = (db) => new Date(Date.UTC(2026, 0, 1) + ++db.clock * 1000).toISOString();

  window.__IC_SUPABASE__ = () => {
    let session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    const subs = [];
    const setSession = (s, event) => {
      session = s;
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      subs.forEach((cb) => cb(event, s));
    };
    const publicUser = (u) => ({ id: u.id, email: u.email, user_metadata: u.meta });
    const ok = (data = null) => Promise.resolve({ data, error: null });
    const err = (message) => Promise.resolve({ data: null, error: { message } });

    const auth = {
      onAuthStateChange(cb) {
        subs.push(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession: () => ok({ session }),
      signUp({ email, password, options }) {
        const db = load();
        if (db.users.some((u) => u.email === email)) return err('User already registered');
        const u = { id: 'u' + (db.users.length + 1), email, password, meta: options?.data || {} };
        db.users.push(u);
        save(db);
        if (email.includes('confirm')) return ok({ user: publicUser(u), session: null });
        const s = { user: publicUser(u) };
        setSession(s, 'SIGNED_IN');
        return ok({ user: s.user, session: s });
      },
      signInWithPassword({ email, password }) {
        const u = load().users.find((x) => x.email === email && x.password === password);
        if (!u) return err('Invalid login credentials');
        setSession({ user: publicUser(u) }, 'SIGNED_IN');
        return ok({ session });
      },
      signOut() {
        setSession(null, 'SIGNED_OUT');
        return ok();
      },
      updateUser(patch) {
        const db = load();
        const u = db.users.find((x) => x.id === session?.user.id);
        if (!u) return err('not signed in');
        if (patch.password) u.password = patch.password;
        if (patch.data) u.meta = { ...u.meta, ...patch.data };
        save(db);
        session = { user: publicUser(u) };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return ok({ user: session.user });
      },
      resetPasswordForEmail: () => ok(),
      signInWithOAuth: () => ok(),
    };

    function from(table) {
      if (table !== 'sets') throw new Error('unknown table ' + table);
      const q = { gt: null, range: [0, 999] };
      const run = () => {
        if (!session) return { data: null, error: { message: 'JWT expired' } };
        const rows = load()
          .sets.filter((r) => r.user_id === session.user.id && (!q.gt || r.updated_at > q.gt))
          .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))
          .slice(q.range[0], q.range[1] + 1);
        return { data: JSON.parse(JSON.stringify(rows)), error: null };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        gt: (_col, v) => ((q.gt = v), builder),
        range: (a, b) => ((q.range = [a, b]), builder),
        then: (res, rej) => Promise.resolve(run()).then(res, rej),
        upsert(rows) {
          if (!session) return err('JWT expired');
          const db = load();
          for (const row of rows) {
            if (row.user_id !== session.user.id) return err('new row violates row-level security policy');
            const i = db.sets.findIndex((r) => r.user_id === row.user_id && r.id === row.id);
            const stored = { ...row, updated_at: tick(db) };
            if (i >= 0) db.sets[i] = stored;
            else db.sets.push(stored);
          }
          save(db);
          return ok();
        },
      };
      return builder;
    }

    function rpc(name) {
      if (name !== 'delete_my_account' || !session) return err('not allowed');
      const db = load();
      db.users = db.users.filter((u) => u.id !== session.user.id);
      db.sets = db.sets.filter((r) => r.user_id !== session.user.id);
      save(db);
      return ok();
    }

    return { auth, from, rpc };
  };
  window.__IC_CLOUD_CONFIG__ = { supabaseUrl: 'https://mock.supabase.co', supabaseAnonKey: 'mock', oauthProviders: ['google'] };
})();
