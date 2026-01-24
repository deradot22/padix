import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setToken } from "../../lib/api";

export function LoginPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.login(email, password);
      setToken(token);
      const me = await api.me();
      props.onAuth(me);
      if (!me.surveyCompleted) nav("/survey");
      else nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="section-title">Войти</div>
      <div className="grid">
        <div className="card" style={{ gridColumn: "span 6" }}>
          <form onSubmit={onSubmit}>
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div style={{ height: 10 }} />
            <label className="label">Пароль</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div style={{ height: 14 }} />
            <button className="btn primary" disabled={loading}>
              {loading ? "Входим…" : "Войти"}
            </button>
            {error ? <div style={{ marginTop: 12 }} className="error">{error}</div> : null}
          </form>
        </div>
        <div className="card" style={{ gridColumn: "span 6" }}>
          <h2>Нет аккаунта?</h2>
          <div className="muted" style={{ marginBottom: 12 }}>
            Зарегистрируйся и пройди короткий опрос — это даст стартовый рейтинг.
          </div>
          <Link to="/register" className="btn">
            Регистрация →
          </Link>
        </div>
      </div>
    </>
  );
}

