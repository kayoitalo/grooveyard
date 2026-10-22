"use client";

import { privateFetch } from "@/lib/http/private-fetch";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { describeRefresh } from "@/components/ai/refresh-report";
import { Aviso } from "@/components/amigo/aviso";
import { Resposta, Respostas } from "@/components/amigo/fala";
import styles from "./ajustes.module.css";

interface SyncForm {
  username: string;
}

interface SyncStatus {
  connection: { username: string; status: string; lastSyncedAt: string | null } | null;
  latestRun: {
    status: string;
    fetchedCount: number;
    insertedCount: number;
    duplicateCount: number;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;
}

interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  displayName?: string;
  reason?: string;
}

interface EnrichmentCoverage {
  totalArtists: number;
  resolvedCount: number;
  percentage: number;
  totalCanonicalAlbums: number;
  albumsWithCover: number;
  albumsWithoutCover: number;
  pendingCoverLookup: number;
  coverPercentage: number;
  albumsInCatalog: number;
  pendingCatalogLookup: number;
  totalTracks: number;
  tracksWithDuration: number;
  durationPercentage: number;
}

type AddressAs = "masculino" | "feminino" | "neutro";

const ADDRESS_OPTIONS: Array<{ value: AddressAs; label: string; sample: string }> = [
  { value: "masculino", label: "mano", sample: "“Caraca, mermão, 22 vezes o mesmo disco?”" },
  { value: "feminino", label: "mina", sample: "“Caraca, amiga, 22 vezes o mesmo disco?”" },
  { value: "neutro", label: "sem apelido", sample: "“Caraca, 22 vezes o mesmo disco?”" },
];

const count = (value: number) => value.toLocaleString("pt-BR");

function Secao({ title, state, stateKind, children }: { title: string; state?: ReactNode; stateKind?: "erro"; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.title}>
        {title}
        {state && (
          <span className={styles.state} data-kind={stateKind}>
            {" "}
            · {state}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

function Numeros({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className={styles.figures}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Os bastidores: de onde vem cada número, o que fica guardado e para onde
 * as descobertas podem ir. Tudo em texto, uma seção por assunto, com as
 * ações como respostas — e o jeito de ele falar contigo como pergunta dele.
 */
export function Ajustes() {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const busy = activeAction !== null;
  const [loads, setLoads] = useState<Record<string, "loading" | "ready" | "error">>({ sync: "loading", coverage: "loading", spotify: "loading", preferences: "loading" });
  const [message, setMessage] = useState<{ text: string; kind?: "erro" } | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [coverage, setCoverage] = useState<EnrichmentCoverage | null>(null);
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const [addressAs, setAddressAs] = useState<AddressAs | null>(null);
  const searchParams = useSearchParams();

  const loadJson = useCallback(async <T,>(url: string, apply: (payload: T) => void, key: string) => {
    setLoads((current) => ({ ...current, [key]: "loading" }));
    try {
      const response = await privateFetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao consultar");
      apply((await response.json()) as T);
      setLoads((current) => ({ ...current, [key]: "ready" }));
    } catch (cause) {
      setLoads((current) => ({ ...current, [key]: "error" }));
      console.error(`Failed to load ${url}`, cause);
    }
  }, []);

  const loadSyncStatus = useCallback(() => loadJson<SyncStatus>("/api/sync", setSyncStatus, "sync"), [loadJson]);
  const loadCoverage = useCallback(
    () => loadJson<{ data: EnrichmentCoverage }>("/api/enrichment", (payload) => setCoverage(payload.data), "coverage"),
    [loadJson],
  );
  const loadSpotify = useCallback(() => loadJson<SpotifyStatus>("/api/spotify/connect", setSpotify, "spotify"), [loadJson]);

  useEffect(() => {
    void loadSyncStatus();
    void loadCoverage();
    void loadSpotify();
    void loadJson<{ addressAs: AddressAs }>("/api/user/preferences", (payload) => setAddressAs(payload.addressAs), "preferences");
  }, [loadCoverage, loadJson, loadSpotify, loadSyncStatus]);

  // o callback do Spotify devolve o resultado na barra de endereço
  useEffect(() => {
    const outcome = searchParams.get("spotify");
    if (!outcome) return;
    if (outcome === "conectado") setMessage({ text: `Spotify conectado como ${searchParams.get("conta") ?? "tua conta"}.` });
    else if (outcome === "cancelado") setMessage({ text: "Você cancelou a autorização no Spotify.", kind: "erro" });
    else if (outcome === "estado-invalido")
      setMessage({ text: "A autorização não confere com este navegador. Tenta conectar de novo.", kind: "erro" });
    else setMessage({ text: "Não deu pra concluir a conexão com o Spotify.", kind: "erro" });
    void loadSpotify();
    window.history.replaceState(null, "", "/settings");
  }, [searchParams, loadSpotify]);

  /** A troca vale para as próximas leituras; as já escritas continuam como estão. */
  const chooseAddress = (next: AddressAs) => {
    const previous = addressAs;
    setAddressAs(next);
    void privateFetch("/api/user/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addressAs: next }),
    }).then((response) => {
      if (!response.ok) {
        setAddressAs(previous);
        setMessage({ text: "Não deu pra salvar o jeito de falar.", kind: "erro" });
      }
    }).catch(() => {
      setAddressAs(previous);
      setMessage({ text: "A conexão falhou. Não consegui salvar o jeito de falar.", kind: "erro" });
    });
  };

  const run = async (action: string, task: () => Promise<string>) => {
    if (busy) return;
    setActiveAction(action);
    setMessage(null);
    try {
      setMessage({ text: await task() });
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "Algo deu errado.", kind: "erro" });
    } finally {
      setActiveAction(null);
    }
  };

  const post = async (url: string, body?: object) => {
    const response = await privateFetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Algo deu errado.");
    return payload;
  };

  const {
    register,
    handleSubmit,
    setValue,
    getFieldState,
    formState: { errors, isValid },
  } = useForm<SyncForm>({ mode: "onChange" });

  useEffect(() => {
    const username = syncStatus?.connection?.username;
    if (username && !getFieldState("username").isDirty) setValue("username", username, { shouldValidate: true });
  }, [syncStatus?.connection?.username, setValue, getFieldState]);

  const onSubmit = (data: SyncForm) =>
    run("sync", async () => {
      const payload = await post("/api/sync", { username: data.username.trim() });
      await loadSyncStatus();
      return `Pronto: ${count(payload.sync.inserted)} audições novas.`;
    });

  const enrichArtists = () =>
    run("artists", async () => {
      const payload = await post("/api/enrichment");
      setCoverage(payload.data.coverage);
      return `Pronto: ${payload.data.summary.resolved} artistas e ${payload.data.summary.coversResolved} capas a mais.`;
    });

  const repairCovers = () =>
    run("covers", async () => {
      const payload = await post("/api/enrichment", { action: "covers", batchSize: 20 });
      setCoverage(payload.data.coverage);
      return `${payload.data.covers.resolved} capas novas encontradas.`;
    });

  /** Duas chamadas por disco no ritmo da Apple: o lote é pequeno de propósito, um clique de cada vez. */
  const fetchCatalog = () =>
    run("catalog", async () => {
      const payload = await post("/api/enrichment", { action: "catalog", batchSize: 8 });
      setCoverage(payload.data.coverage);
      const { matched, missing, tracksUpdated } = payload.data.catalog;
      return `${matched} discos encontrados, ${missing} sem correspondência e ${tracksUpdated} faixas com duração e prévia.`;
    });

  /**
   * O mesmo endpoint do cron. Ele aceita a chamada de dentro da página
   * (same-origin) justamente para não precisar do segredo no navegador —
   * e gera no máximo um pacote por clique, como o cron.
   */
  const writeTexts = () =>
    run("ai", async () => {
      const payload = await post("/api/ai/refresh");
      return describeRefresh(payload.report);
    });

  const connectSpotify = () =>
    run("connect", async () => {
      const payload = await post("/api/spotify/connect");
      window.location.href = payload.authorizeUrl;
      return "Abrindo o Spotify…";
    });

  const disconnectSpotify = () =>
    run("disconnect", async () => {
      const response = await privateFetch("/api/spotify/connect", { method: "DELETE" });
      if (!response.ok) throw new Error("Não deu pra desconectar.");
      await loadSpotify();
      return "Spotify desconectado.";
    });

  const eraseEverything = () => {
    if (!confirm("Apagar todo o teu histórico? Isso não pode ser desfeito.")) return;
    void run("erase", async () => {
      const response = await privateFetch("/api/user/data", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não deu pra apagar os dados.");
      return payload.message;
    });
  };

  const connected = syncStatus?.connection;
  const syncError = syncStatus?.latestRun?.errorMessage;
  const sample = ADDRESS_OPTIONS.find((option) => option.value === addressAs)?.sample;
  const actionLabels: Record<string, string> = {
    sync: "Buscando novas audições no Last.fm…", artists: "Buscando informações dos artistas…",
    covers: "Procurando as capas que faltam…", catalog: "Consultando os discos no catálogo…",
    ai: "Escrevendo uma leitura nova. Pode levar até um minuto…", connect: "Abrindo o Spotify…",
    disconnect: "Desconectando o Spotify…", erase: "Apagando teu histórico…",
  };

  return (
    <div className={styles.page}>
      <Aviso
        compact
        window="ajustes"
        headline="Daqui eu tiro tudo que te conto."
        narrative="De onde vem cada número, o que fica guardado aqui e pra onde as descobertas podem ir."
      />

      {(message || activeAction) && (
        <p role={message?.kind === "erro" ? "alert" : "status"} className={styles.status} data-kind={message?.kind}>
          {activeAction ? actionLabels[activeAction] : message?.text}
        </p>
      )}

      {Object.values(loads).includes("error") && (
        <div className={styles.loadError} role="alert">
          <p>Não consegui consultar todos os ajustes. Isso não quer dizer que as conexões foram desfeitas.</p>
          <Resposta onClick={() => {
            void loadSyncStatus(); void loadCoverage(); void loadSpotify();
            void loadJson<{ addressAs: AddressAs }>("/api/user/preferences", (payload) => setAddressAs(payload.addressAs), "preferences");
          }}>tentar carregar de novo</Resposta>
        </div>
      )}

      <Secao
        title="o teu Last.fm"
        state={loads.sync === "loading" ? "consultando…" : loads.sync === "error" ? "não consegui consultar" : syncError ? "a última busca falhou" : connected ? connected.username : "não conectado"}
        stateKind={syncError ? "erro" : undefined}
      >
        <p className={styles.hint}>De onde vem o teu histórico. A busca roda sozinha de hora em hora, mas dá pra forçar agora.</p>
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <label className={styles.field}>
            <span>teu usuário</span>
            <input type="text" {...register("username", { required: "Me diz o usuário" })} placeholder={connected?.username ?? "usuário"} />
            {errors.username && <em className={styles.fieldError}>{errors.username.message}</em>}
          </label>
          <Respostas inline label="Last.fm">
            <Resposta submit disabled={busy || !isValid}>
              {activeAction === "sync" ? "buscando…" : "buscar agora"}
            </Resposta>
          </Respostas>
        </form>
        {connected && (
          <Numeros
            items={[
              ["última busca", connected.lastSyncedAt ? new Date(connected.lastSyncedAt).toLocaleDateString("pt-BR") : "nunca"],
              ["audições novas nela", count(syncStatus?.latestRun?.insertedCount ?? 0)],
            ]}
          />
        )}
        {syncError && <p className={styles.fieldError}>{syncError}</p>}
      </Secao>

      <Secao title="como eu falo contigo">
        <p className={styles.hint}>Escolhe como eu te chamo. Vale a partir da próxima leitura que eu escrever.</p>
        <ul className={styles.choices} role="group" aria-label="Como ele te chama">
          {ADDRESS_OPTIONS.map((option) => (
            <li key={option.value}>
              <button type="button" aria-pressed={addressAs === option.value} onClick={() => chooseAddress(option.value)}>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
        {sample && <p className={styles.sample}>{sample}</p>}
      </Secao>

      <Secao title="os artistas e os discos">
        <p className={styles.hint}>
          País, gênero, ano e capa do que você mais ouve. O MusicBrainz aceita uma consulta por segundo, então vai aos poucos.
        </p>
        <Respostas inline label="Artistas e capas">
          <Resposta onClick={enrichArtists} disabled={busy}>
            {activeAction === "artists" ? "buscando artistas…" : "buscar artistas"}
          </Resposta>
          <Resposta onClick={repairCovers} disabled={busy}>
            {activeAction === "covers" ? "procurando capas…" : "procurar capas"}
          </Resposta>
        </Respostas>
        {coverage && (
          <Numeros
            items={[
              ["artistas com informação", `${coverage.percentage}%`],
              ["discos", count(coverage.totalCanonicalAlbums)],
              ["com capa", `${coverage.coverPercentage}%`],
              ["capas na fila", count(coverage.pendingCoverLookup)],
            ]}
          />
        )}
      </Secao>

      <Secao
        title="o catálogo da Apple"
        state={coverage ? `${count(coverage.albumsInCatalog)} de ${count(coverage.totalCanonicalAlbums)} discos` : undefined}
      >
        <p className={styles.hint}>
          De onde vêm capa, gênero, ano, duração exata e a prévia de 30s — inclusive dos discos que o MusicBrainz não
          conhece. Cada clique consulta oito discos, começando pelos que você mais ouviu no último mês.
        </p>
        <Respostas inline label="Catálogo">
          <Resposta onClick={fetchCatalog} disabled={busy}>
            {activeAction === "catalog" ? "consultando…" : "consultar catálogo"}
          </Resposta>
        </Respostas>
        {coverage && (
          <Numeros
            items={[
              ["no catálogo", count(coverage.albumsInCatalog)],
              ["na fila", count(coverage.pendingCatalogLookup)],
              ["faixas com duração", `${coverage.durationPercentage}%`],
            ]}
          />
        )}
      </Secao>

      <Secao title="o que eu escrevo">
        <p className={styles.hint}>
          Eu escrevo as leituras de cada período de uma vez e reaproveito por horas; depois de cada busca no Last.fm eu
          refaço o que envelheceu. Aqui você não espera: cada clique escreve o período mais atrasado.
        </p>
        <Respostas inline label="Leituras">
          <Resposta onClick={writeTexts} disabled={busy}>
            {activeAction === "ai" ? "escrevendo…" : "escreve agora"}
          </Resposta>
        </Respostas>
        <p className={styles.small}>
          A resposta do modelo é longa: um clique leva de 20 a 60 segundos. Período já em dia é pulado sem gastar cota.
        </p>
      </Secao>

      <Secao title="playlists" state={loads.spotify === "loading" ? "consultando…" : loads.spotify === "error" ? "não consegui consultar" : spotify?.connected ? `Spotify · ${spotify.displayName}` : "não conectado"}>
        <p className={styles.hint}>
          O que você separar em “pra ouvir depois” pode virar playlist. Conectado, ela nasce direto na tua conta; sem
          conectar, você leva links e um arquivo .m3u.
        </p>
        <p className={styles.small}>
          O Spotify é só destino: nada de lá volta pras tuas estatísticas nem pro que eu escrevo. A permissão pedida
          cria playlists e mais nada.
        </p>
        {spotify && !spotify.configured && <p className={styles.small}>{spotify.reason}</p>}
        {spotify?.configured && (
          <Respostas inline label="Spotify">
            {spotify.connected ? (
              <Resposta onClick={disconnectSpotify} disabled={busy}>
                desconectar
              </Resposta>
            ) : (
              <Resposta onClick={connectSpotify} disabled={busy}>
                conectar Spotify
              </Resposta>
            )}
          </Respostas>
        )}
      </Secao>

      <Secao title="teus dados">
        <p className={styles.hint}>Tudo que está guardado aqui é teu, e sai daqui quando você quiser — em JSON, de uma vez.</p>
        <div className={styles.actions}>
          <Respostas inline label="Dados">
            <Resposta href="/api/user/data" download>
              baixar cópia
            </Resposta>
          </Respostas>
          <button type="button" className={styles.danger} onClick={eraseEverything} disabled={busy}>
            apagar tudo
          </button>
        </div>
      </Secao>
    </div>
  );
}
