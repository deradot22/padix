import { useEffect, useState } from "react";
import { ApiError, auth, survey, SurveyDefinition } from "../api";
import { store, TestUser, useStore } from "../store";
import { Log, LogEntry } from "../components/Log";

const FALLBACK_DEFINITION: SurveyDefinition = {
  id: "survey-v2",
  version: 2,
  levelCards: [],
  questions: ["q_wall", "q_net", "q_lob", "q_consistency", "q_tactics"].map((qid) => ({
    id: qid,
    title: qid,
    options: [0, 1, 2, 3].map((i) => ({ id: `${qid}_${i}`, label: `option ${i}` })),
  })),
};

function buildAnswers(def: SurveyDefinition, optionIdx: number): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of def.questions) {
    const opt = q.options[Math.min(optionIdx, q.options.length - 1)];
    answers[q.id] = opt.id;
  }
  return answers;
}

const START_NUMBER_KEY = "padix-test-ui:start-number";

export function UsersPage() {
  const users = useStore((s) => s.users);
  const [count, setCount] = useState(5);
  const [startNumber, setStartNumber] = useState<number>(() => {
    const raw = localStorage.getItem(START_NUMBER_KEY);
    return raw ? Math.max(1, Number(raw) || 1) : 1;
  });
  const [emailDomain, setEmailDomain] = useState("test.local");
  const [namePrefix, setNamePrefix] = useState("User");
  const [password, setPassword] = useState("test123456");
  const [genderMode, setGenderMode] = useState<"mix" | "M" | "F">("mix");
  const [optionLevel, setOptionLevel] = useState(2); // 0..3 — уровень ответов в анкете
  const [running, setRunning] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [definition, setDefinition] = useState<SurveyDefinition>(FALLBACK_DEFINITION);

  useEffect(() => {
    survey.current().then(setDefinition).catch(() => {
      /* fallback */
    });
  }, []);

  function log(level: LogEntry["level"], text: string) {
    setEntries((prev) => [...prev, { level, text, ts: Date.now() }]);
  }

  function persistStartNumber(n: number) {
    setStartNumber(n);
    localStorage.setItem(START_NUMBER_KEY, String(n));
  }

  async function createBatch() {
    setRunning(true);
    let n = startNumber;
    let created = 0;
    const safetyCap = startNumber + count * 50; // защита от бесконечного цикла

    for (let i = 0; i < count; i++) {
      // Подбираем следующий свободный номер: при 409 (email или имя занято) — увеличиваем и пробуем снова.
      let registered: { token: string; n: number } | null = null;
      while (n < safetyCap) {
        const email = `${n}@${emailDomain}`;
        const name = `${namePrefix} ${n}`;
        const gender: "M" | "F" =
          genderMode === "mix" ? (n % 2 === 1 ? "M" : "F") : genderMode;

        log("info", `[${i + 1}/${count}] Регистрирую ${email} (${name})…`);
        try {
          const { token } = await auth.register({ email, password, name, gender });
          registered = { token, n };
          break;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            log("warn", `   ⚠ номер ${n} занят, пробую следующий`);
            n++;
            continue;
          }
          log("err", `   × ${(e as Error).message}`);
          break;
        }
      }
      if (!registered) {
        log("err", "Не удалось зарегистрировать, прерываю.");
        break;
      }

      const number = registered.n;
      const email = `${number}@${emailDomain}`;
      const name = `${namePrefix} ${number}`;
      const gender: "M" | "F" =
        genderMode === "mix" ? (number % 2 === 1 ? "M" : "F") : genderMode;
      log("ok", `   ✓ зарегистрирован (#${number})`);

      try {
        const answers = buildAnswers(definition, optionLevel);
        const me = await survey.submit(registered.token, {
          version: definition.version,
          answers,
        });
        log("ok", `   ✓ опрос → уровень ${me.surveyLevel}, NTRP ${me.ntrp}, rating ${me.rating}`);

        store.addUser({
          id: crypto.randomUUID(),
          email,
          password,
          name,
          gender,
          surveyLevelCardId: `opt${optionLevel}`,
          token: registered.token,
          playerId: me.playerId,
          surveyCompleted: me.surveyCompleted,
          createdAt: Date.now(),
        });
        created++;
      } catch (e) {
        log("err", `   × опрос: ${(e as Error).message}`);
      }
      n++;
    }

    persistStartNumber(n);
    log("info", `Готово. Создано: ${created}/${count}. Следующий номер: ${n}.`);
    setRunning(false);
  }

  async function refreshUser(u: TestUser) {
    try {
      const me = await auth.me(u.token);
      log("ok", `${u.email} → NTRP=${me.ntrp} rating=${me.rating} cal=${me.calibrationMatchesRemaining}`);
    } catch (e) {
      log("err", `${u.email}: ${(e as Error).message}`);
    }
  }

  async function relogin(u: TestUser) {
    try {
      const { token } = await auth.login({ email: u.email, password: u.password });
      const me = await auth.me(token);
      store.removeUser(u.id);
      store.addUser({ ...u, token, playerId: me.playerId, surveyCompleted: me.surveyCompleted });
      log("ok", `${u.email}: новый токен`);
    } catch (e) {
      log("err", `${u.email}: ${(e as Error).message}`);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Создать пользователей</h2>
        <p className="muted small" style={{ marginTop: -8, marginBottom: 16 }}>
          Каждый пользователь: <span className="mono">POST /api/auth/register</span> →{" "}
          <span className="mono">POST /api/survey/submit</span>. Email вида{" "}
          <span className="mono">{startNumber}@{emailDomain}</span>, имя <span className="mono">{namePrefix} {startNumber}</span>.
          При коллизии номер увеличивается автоматически.
        </p>

        <div className="row">
          <div className="field">
            <label>Количество</label>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="field">
            <label>Начать с номера</label>
            <input
              type="number"
              min={1}
              value={startNumber}
              onChange={(e) => persistStartNumber(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="field">
            <label>Email-домен</label>
            <input value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} />
          </div>
          <div className="field">
            <label>Префикс имени</label>
            <input value={namePrefix} onChange={(e) => setNamePrefix(e.target.value)} />
          </div>
          <div className="field">
            <label>Пароль</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Пол</label>
            <select value={genderMode} onChange={(e) => setGenderMode(e.target.value as "mix" | "M" | "F")}>
              <option value="mix">Чередовать M/F</option>
              <option value="M">Все мужчины</option>
              <option value="F">Все женщины</option>
            </select>
          </div>
          <div className="field">
            <label>Уровень ответов (0=новичок, 3=сильный)</label>
            <select
              value={optionLevel}
              onChange={(e) => setOptionLevel(Number(e.target.value))}
            >
              <option value={0}>0 — слабые ответы</option>
              <option value={1}>1 — средне-низкие</option>
              <option value={2}>2 — средне-высокие</option>
              <option value={3}>3 — сильные</option>
            </select>
          </div>
          <button onClick={createBatch} disabled={running}>
            {running ? "Создаю…" : `Создать ${count}`}
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <Log entries={entries} />
        </div>
      </div>

      <div className="card">
        <h2>
          Созданные пользователи <span className="badge">{users.length}</span>
        </h2>
        {users.length === 0 ? (
          <div className="muted">Пока никого нет. Создай партию выше.</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <button
                className="danger"
                onClick={() => {
                  if (confirm("Удалить всех из локального стейта? (в БД они останутся)")) {
                    store.clearUsers();
                  }
                }}
              >
                Очистить локальный список
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Пароль</th>
                  <th>Имя</th>
                  <th>Пол</th>
                  <th>playerId</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="mono small">{u.email}</td>
                    <td className="mono small">{u.password}</td>
                    <td>{u.name}</td>
                    <td>{u.gender}</td>
                    <td className="mono small">{u.playerId.slice(0, 8)}…</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="secondary" onClick={() => refreshUser(u)}>
                        /me
                      </button>{" "}
                      <button className="secondary" onClick={() => relogin(u)}>
                        Перелогин
                      </button>{" "}
                      <button className="secondary" onClick={() => store.removeUser(u.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
