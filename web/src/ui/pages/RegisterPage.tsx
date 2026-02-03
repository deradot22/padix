import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setToken } from "../../lib/api";

export function RegisterPage(props: { onAuth: (me: any) => void }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.register(email, password, name);
      setToken(token);
      const me = await api.me();
      props.onAuth(me);
      nav("/survey");
    } catch (err: any) {
      setError(err?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="section-title">Регистрация</div>
      <div className="grid">
        <div className="card grid-half">
          <form onSubmit={onSubmit}>
            <label className="label">Имя (как в рейтинге)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <div style={{ height: 10 }} />
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div style={{ height: 10 }} />
            <label className="label">Пароль</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div style={{ height: 14 }} />
            <button className="btn primary" disabled={loading}>
              {loading ? "Создаём…" : "Создать аккаунт"}
            </button>
            {error ? <div style={{ marginTop: 12 }} className="error">{error}</div> : null}
          </form>
        </div>
        <div className="card grid-half">
          <h2>Уже есть аккаунт?</h2>
          <div className="muted" style={{ marginBottom: 12 }}>
            Войди, чтобы увидеть игры на сегодня и свой профиль.
          </div>
          <Link to="/login" className="btn">
            Войти →
          </Link>
        </div>
      </div>
    </>
  );
}

