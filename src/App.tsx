import { useEffect, useMemo, useRef, useState } from "react";
import { seedState } from "./data/seed";
import {
  FEATURE_META,
  featureLabel,
  getIntentWeights,
  learnFromComparison,
  rankGames,
} from "./lib/recommender";
import { exportState, importState, loadState, saveState } from "./lib/storage";
import {
  FEATURE_KEYS,
  type AppState,
  type FeatureKey,
  type Game,
  type GameStatus,
  type Recommendation,
} from "./types";

type View = "recommend" | "library" | "learn";

const STATUS_LABELS: Record<GameStatus, string> = {
  love: "Loved",
  like: "Liked",
  mixed: "Mixed",
  fell_off: "Fell off",
  bounced: "Bounced",
  dislike: "Disliked",
  candidate: "Candidate",
};

const INTENT_CHIPS = [
  "Movement-heavy",
  "Meaningful builds",
  "Demanding execution",
  "Co-op with friends",
  "Deep systems",
  "Persistent character",
];

const DEFAULT_INTENT =
  "Movement-heavy combat with meaningful builds that still demand execution";

function cloneSeed(): AppState {
  return structuredClone(seedState);
}

function makeBlankGame(): Game {
  return {
    id: `game-${Date.now()}`,
    title: "Untitled game",
    status: "candidate",
    features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, 5])) as Game["features"],
    confidence: 0.5,
    notes: "",
    strengths: [],
    concerns: [],
    traits: [],
  };
}

function Logo() {
  return (
    <div className="logo" aria-label="MetaMatch">
      <span className="logo-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        META<b>MATCH</b>
      </span>
    </div>
  );
}

function NavIcon({ name }: { name: View }) {
  if (name === "recommend") return <span aria-hidden="true">⌁</span>;
  if (name === "library") return <span aria-hidden="true">▦</span>;
  return <span aria-hidden="true">⇄</span>;
}

function ScoreGauge({ score, compact = false }: { score: number; compact?: boolean }) {
  return (
    <div
      className={`score-gauge${compact ? " compact" : ""}`}
      style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
      aria-label={`${score} percent match`}
    >
      <div>
        <strong>{score}</strong>
        <span>match</span>
      </div>
    </div>
  );
}

function FeatureBars({ game, limit }: { game: Game; limit?: number }) {
  const values = FEATURE_KEYS.map((key) => ({
    key,
    value: FEATURE_META[key].negative ? 10 - game.features[key] : game.features[key],
  }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  return (
    <div className="feature-bars">
      {values.map(({ key, value }) => (
        <div className="feature-bar" key={key}>
          <div>
            <span>
              {FEATURE_META[key].negative
                ? `Resistance to ${featureLabel(key).toLowerCase()}`
                : featureLabel(key)}
            </span>
            <b>{value.toFixed(0)}</b>
          </div>
          <div className="bar-track">
            <span style={{ width: `${value * 10}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  featured = false,
  onEdit,
}: {
  recommendation: Recommendation;
  featured?: boolean;
  onEdit: (game: Game) => void;
}) {
  const { game, score, positives, risks, analogues, uncertainty } = recommendation;

  if (featured) {
    return (
      <article className="featured-match panel">
        <div className="featured-topline">
          <span className="eyebrow"><i /> strongest signal</span>
          <button className="quiet-button" onClick={() => onEdit(game)}>Tune ratings</button>
        </div>
        <div className="featured-grid">
          <div className="featured-copy">
            <h2>{game.title}</h2>
            <p className="match-summary">{game.notes}</p>
            <div className="reason-grid">
              <div>
                <h3>Why it surfaced</h3>
                <ul className="signal-list positive">
                  {positives.map((reason) => (
                    <li key={reason.key}><span>+</span>{reason.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Watch for</h3>
                <ul className="signal-list risk">
                  {(risks.length ? risks : ["No major known conflict with this craving."]).map((risk) => (
                    <li key={risk}><span>!</span>{risk}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="analogue-line">
              <span>Model anchors</span>
              {analogues.map((analogue) => <b key={analogue}>{analogue}</b>)}
            </div>
            {uncertainty && <p className="uncertainty">{uncertainty}</p>}
          </div>
          <div className="featured-signal">
            <ScoreGauge score={score} />
            <FeatureBars game={game} limit={5} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="match-card panel">
      <div className="match-card-head">
        <div>
          <span className="trait">{game.traits.slice(0, 2).join(" · ")}</span>
          <h3>{game.title}</h3>
        </div>
        <ScoreGauge score={score} compact />
      </div>
      <p>{game.notes}</p>
      <div className="mini-reasons">
        {positives.slice(0, 2).map((reason) => <span key={reason.key}>{reason.label}</span>)}
      </div>
      {risks[0] && <p className="card-risk"><b>Possible miss:</b> {risks[0]}</p>}
      <button className="text-button" onClick={() => onEdit(game)}>Inspect signals →</button>
    </article>
  );
}

function RecommendView({
  state,
  intent,
  setIntent,
  onEdit,
}: {
  state: AppState;
  intent: string;
  setIntent: (value: string) => void;
  onEdit: (game: Game) => void;
}) {
  const recommendations = useMemo(() => rankGames(state, intent), [state, intent]);
  const weights = useMemo(() => getIntentWeights(state.model, intent), [state.model, intent]);
  const dominantSignals = FEATURE_KEYS.filter((key) => !FEATURE_META[key].negative)
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, 4);

  const toggleChip = (chip: string) => {
    const escaped = chip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`(?:,?\\s*)${escaped}`, "i");
    setIntent(expression.test(intent) ? intent.replace(expression, "").trim() : `${intent}, ${chip}`);
  };

  return (
    <main className="view recommend-view">
      <section className="intent-panel panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">current craving</span>
            <h1>What should the next game feel like?</h1>
          </div>
          <span className="candidate-count">{recommendations.length} candidates modeled</span>
        </div>
        <label className="intent-input">
          <span className="sr-only">Describe the game you want</span>
          <textarea value={intent} onChange={(event) => setIntent(event.target.value)} rows={2} />
          <span aria-hidden="true">↵</span>
        </label>
        <div className="chip-row" aria-label="Quick craving filters">
          {INTENT_CHIPS.map((chip) => (
            <button
              className={intent.toLowerCase().includes(chip.toLowerCase()) ? "active" : ""}
              key={chip}
              onClick={() => toggleChip(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="active-signals">
          <span>Priority signal</span>
          {dominantSignals.map((key, index) => (
            <div key={key}>
              <i style={{ opacity: 1 - index * 0.17 }} />
              {featureLabel(key)}
            </div>
          ))}
        </div>
      </section>

      {recommendations[0] ? (
        <>
          <RecommendationCard recommendation={recommendations[0]} featured onEdit={onEdit} />
          <div className="results-heading">
            <div>
              <span className="eyebrow">alternate routes</span>
              <h2>Different ways to satisfy the same craving</h2>
            </div>
            <span>Scores include confidence penalties</span>
          </div>
          <section className="match-grid">
            {recommendations.slice(1).map((recommendation) => (
              <RecommendationCard
                key={recommendation.game.id}
                recommendation={recommendation}
                onEdit={onEdit}
              />
            ))}
          </section>
        </>
      ) : (
        <section className="empty panel">
          <b>No candidates yet</b>
          <p>Add games to the library and mark them as candidates.</p>
        </section>
      )}
    </main>
  );
}

function LibraryView({ state, onEdit }: { state: AppState; onEdit: (game: Game) => void }) {
  const [filter, setFilter] = useState<GameStatus | "all">("all");
  const [query, setQuery] = useState("");
  const games = state.games.filter(
    (game) =>
      (filter === "all" || game.status === filter) &&
      game.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <main className="view">
      <div className="page-title">
        <div>
          <span className="eyebrow">training evidence</span>
          <h1>Game library</h1>
          <p>The useful part is not the rating. It’s the reason underneath it.</p>
        </div>
        <button className="primary-button" onClick={() => onEdit(makeBlankGame())}>+ Add game</button>
      </div>
      <section className="library-tools panel">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a game"
          />
        </label>
        <div className="filter-row">
          {(["all", "love", "like", "fell_off", "bounced", "candidate"] as const).map((status) => (
            <button
              className={filter === status ? "active" : ""}
              key={status}
              onClick={() => setFilter(status)}
            >
              {status === "all" ? "All" : STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </section>
      <section className="library-list panel">
        <div className="library-header">
          <span>Game</span><span>Strongest signals</span><span>Confidence</span><span>Status</span><span />
        </div>
        {games.map((game) => {
          const top = FEATURE_KEYS.filter((key) => !FEATURE_META[key].negative)
            .sort((a, b) => game.features[b] - game.features[a])
            .slice(0, 2);
          return (
            <button className="library-row" key={game.id} onClick={() => onEdit(game)}>
              <span className="game-name"><i>{game.title.slice(0, 1)}</i><b>{game.title}</b></span>
              <span className="row-signals">{top.map((key) => <em key={key}>{FEATURE_META[key].short}</em>)}</span>
              <span className="confidence"><i><b style={{ width: `${game.confidence * 100}%` }} /></i>{Math.round(game.confidence * 100)}%</span>
              <span><em className={`status status-${game.status}`}>{STATUS_LABELS[game.status]}</em></span>
              <span className="row-arrow">→</span>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function LearnView({ state, setState }: { state: AppState; setState: (state: AppState) => void }) {
  const pool = state.games.filter((game) => game.status !== "candidate" && game.status !== "mixed");
  const pairIndex = state.comparisons.length;
  const left = pool[pairIndex % pool.length];
  let right = pool[(pairIndex * 3 + 2) % pool.length];
  if (right?.id === left?.id) right = pool[(pairIndex + 1) % pool.length];

  const choose = (winner: Game, loser: Game) => {
    setState({
      ...state,
      model: learnFromComparison(state.model, winner, loser),
      comparisons: [
        ...state.comparisons,
        {
          id: crypto.randomUUID(),
          leftId: left.id,
          rightId: right.id,
          winnerId: winner.id,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  };

  if (!left || !right) return null;

  return (
    <main className="view learn-view">
      <div className="page-title centered">
        <div>
          <span className="eyebrow">pairwise learning</span>
          <h1>Which experience would you rather have again?</h1>
          <p>Choose from the whole experience, not which game is objectively better.</p>
        </div>
      </div>
      <section className="comparison-wrap">
        {[left, right].map((game, index) => {
          const other = index === 0 ? right : left;
          return (
            <button className="comparison-card panel" key={game.id} onClick={() => choose(game, other)}>
              <span className="choice-key">{index === 0 ? "A" : "B"}</span>
              <span className={`status status-${game.status}`}>{STATUS_LABELS[game.status]}</span>
              <h2>{game.title}</h2>
              <p>{game.notes}</p>
              <FeatureBars game={game} limit={4} />
              <strong>Choose {game.title} →</strong>
            </button>
          );
        })}
        <div className="versus">OR</div>
      </section>
      <div className="learning-footer panel">
        <div>
          <b>{state.model.comparisonsLearned}</b>
          <span>comparisons learned</span>
        </div>
        <p>Each answer nudges feature weights. It never overwrites your written reasons or game ratings.</p>
      </div>
    </main>
  );
}

function GameEditor({
  game,
  onSave,
  onDelete,
  onClose,
}: {
  game: Game;
  onSave: (game: Game) => void;
  onDelete: (game: Game) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Game>(structuredClone(game));
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const setFeature = (key: FeatureKey, value: number) =>
    setDraft({ ...draft, features: { ...draft.features, [key]: value } });

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="editor panel" role="dialog" aria-modal="true" aria-labelledby="editor-title" tabIndex={-1} ref={dialogRef}>
        <div className="editor-head">
          <div>
            <span className="eyebrow">model evidence</span>
            <h2 id="editor-title">Tune game signals</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="editor-fields">
          <label>
            <span>Game</span>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label>
            <span>Relationship</span>
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as GameStatus })}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="notes-field">
          <span>Why it works—or doesn’t</span>
          <textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <div className="slider-grid">
          {FEATURE_KEYS.map((key) => (
            <label className={FEATURE_META[key].negative ? "negative" : ""} key={key}>
              <span>{featureLabel(key)} <b>{draft.features[key]}</b></span>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={draft.features[key]}
                onChange={(event) => setFeature(key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
        <label className="confidence-slider">
          <span>Assessment confidence <b>{Math.round(draft.confidence * 100)}%</b></span>
          <input type="range" min="0.1" max="1" step="0.05" value={draft.confidence} onChange={(event) => setDraft({ ...draft, confidence: Number(event.target.value) })} />
        </label>
        <div className="editor-actions">
          <button className="danger-button" onClick={() => onDelete(draft)}>Delete</button>
          <div>
            <button className="quiet-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" onClick={() => onSave({ ...draft, id: draft.id || `game-${Date.now()}` })}>Save signals</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("recommend");
  const [intent, setIntent] = useState(DEFAULT_INTENT);
  const [editing, setEditing] = useState<Game | null>(null);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadState(cloneSeed()).then(setState);
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importState(file);
      setState(imported);
      flash("Backup restored");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not import that backup");
    }
  };

  if (!state) {
    return <div className="loading"><Logo /><span>Loading your model…</span></div>;
  }

  const saveGame = (game: Game) => {
    const exists = state.games.some((item) => item.id === game.id);
    setState({ ...state, games: exists ? state.games.map((item) => item.id === game.id ? game : item) : [...state.games, game] });
    setEditing(null);
    flash("Signals saved");
  };

  const deleteGame = (game: Game) => {
    setState({ ...state, games: state.games.filter((item) => item.id !== game.id) });
    setEditing(null);
    flash("Game removed");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Primary navigation">
          {(["recommend", "library", "learn"] as View[]).map((item) => (
            <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
              <NavIcon name={item} />
              {item === "recommend" ? "Recommend" : item === "library" ? "Library" : "Teach the model"}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="model-status">
            <span><i /> model online</span>
            <b>CARL v0.1</b>
            <small>{state.games.length} games · {state.model.comparisonsLearned} comparisons</small>
          </div>
          <div className="data-actions">
            <button onClick={() => { exportState(state); flash("Backup downloaded"); }}>Export</button>
            <button onClick={() => fileInput.current?.click()}>Import</button>
            <input ref={fileInput} hidden type="file" accept="application/json" onChange={(event) => handleImport(event.target.files?.[0])} />
          </div>
          <button
            className="reset-button"
            onClick={() => {
              if (window.confirm("Reset every local change and restore the seed model?")) {
                setState(cloneSeed());
                flash("Seed model restored");
              }
            }}
          >
            Reset seed
          </button>
          <p className="local-note"><span>◉</span> Data stays in this browser</p>
        </div>
      </aside>

      <div className="mobile-header">
        <Logo />
        <span>local model</span>
      </div>

      {view === "recommend" && <RecommendView state={state} intent={intent} setIntent={setIntent} onEdit={setEditing} />}
      {view === "library" && <LibraryView state={state} onEdit={setEditing} />}
      {view === "learn" && <LearnView state={state} setState={setState} />}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(["recommend", "library", "learn"] as View[]).map((item) => (
          <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
            <NavIcon name={item} />
            {item === "recommend" ? "Match" : item === "library" ? "Library" : "Learn"}
          </button>
        ))}
      </nav>

      {editing && <GameEditor game={editing} onSave={saveGame} onDelete={deleteGame} onClose={() => setEditing(null)} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
