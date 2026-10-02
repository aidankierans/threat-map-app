import profile from "@threat-map/data/profile.json";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import { lazyFeature } from "./lazy-feature.js";
import { CaseMenu } from "./CaseMenu.js";
import { loadSharedMap } from "./shared-map-api.js";
import type { MapCatalog } from "../shared-map.js";
import { caseReducer, openCase } from "./case-edit.js";
import { autosaveCase, loadCaseDraft, loadCases } from "./case-store.js";
import { fetchSharedCase } from "./case-api.js";
import { parseCase } from "./case-codec.js";
import { deriveCaseStudy } from "./case-derive.js";
import type { AnalysisDocument, ReaderState } from "./reader-state.js";
import type { GraphIndex, ProseBundle } from "../types.js";
import rawIndex from "@threat-map/data/reader-index.json";
import { DEFAULT_FILTERS, buildGraph, bandDetailOf, expandSet, groupKeyOf, hasActiveFilters, heldNodes, type HiddenMode, isDefaultOrder, resolveId, resolveSelection, searchHits, searchNodes, shapeOnlyNodes, statusLabel, structuralNodes, toggleFold, type FilterState, } from "./selectors.js";
import { bandsOf, foldGraph, foldedKeys, foldedSelection, foldedSet } from "./fold.js";
import { conditionFamily } from "./display-groups.js";
import { traceStories } from "./story.js";
import { carriesView, parseFilters, parseHash, pushHash, replaceHash, shareUrl, viewKey, viewLabel, type RouteState, type View, } from "./router.js";
import { loadWorkingView, storeWorkingView } from "./session.js";
import { defaultPreset } from "./saved.js";
import { useDocHistory, type Doc } from "./history.js";
import { GraphCanvas, type HoverTarget } from "./Graph.js";
import { Panel } from "./Panel.js";
import { DocHistoryButtons } from "./DocHistory.js";
import { Filters } from "./Filters.js";
import { sharedRequest, refreshCitations, type SharedCatalog, type SharedRevision } from "./shared-content.js";
import { sharedMarkdown } from "./shared-markdown.js";
import { HoverCard, useProseHover, type HoverContent } from "./HoverCard.js";
import { TipLayer } from "./Tip.js";
import type { DevTools } from "./devtools.js";
import { THEME_KEY } from "./config.js";
import { shouldInviteWalkthrough, dismissWalkthroughInvitation, WALKTHROUGH_REQUEST_EVENT } from "./walkthrough-state.js";
const CaseWorkspace = lazyFeature(async () => ({ default: (await import("./CaseWorkspace.js")).CaseWorkspace }), "case study");
const CaseActions = lazyFeature(async () => ({ default: (await import("./CaseActions.js")).CaseActions }), "case actions");
const PageView = lazyFeature(async () => ({ default: (await import("./DocViews.js")).PageView }), "page");
const BibliographyView = lazyFeature(async () => ({ default: (await import("./BibliographyView.js")).BibliographyView }), "bibliography");
const Walkthrough = lazyFeature(async () => ({ default: (await import("./Walkthrough.js")).Walkthrough }), "tutorial");
const ChangeLog = lazyFeature(async () => ({ default: (await import("./ChangeLog.js")).ChangeLog }), "change log");
const SharedMapEditor = lazyFeature(async () => ({ default: (await import("./SharedMapEditor.js")).SharedMapEditor }), "map editor");
const MapRestoreReview = lazyFeature(async () => ({ default: (await import("./SharedMapEditor.js")).MapRestoreReview }), "map restore");
const baseIndex = rawIndex as unknown as GraphIndex;
const NARROW = "(max-width: 700px)";
function bootRoute(): RouteState {
    const parsed = parseHash(window.location.hash);
    if (carriesView(window.location.hash))
        return parsed;
    const stored = loadWorkingView();
    if (stored)
        return { ...parsed, filters: stored.filters, columns: stored.columns };
    if (parsed.selection.length)
        return parsed;
    const arrival = defaultPreset(baseIndex.presets);
    return arrival ? { ...parsed, filters: parseFilters(arrival.query) } : parsed;
}
export function App() {
    const [shared, setShared] = useState<SharedCatalog>({ editable: false, revisions: [] });
    const [sharedError, setSharedError] = useState("");
    const [changeLogOpen, setChangeLogOpen] = useState(false);
    const [mapCatalog, setMapCatalog] = useState<MapCatalog | null>(null);
    const [mapError, setMapError] = useState("");
    const [mapEditId, setMapEditId] = useState<string | null>(null);
    const [mapRestoreId, setMapRestoreId] = useState<string | null>(null);
    useEffect(() => { let live = true; loadSharedMap().then(data => { if (live)
        setMapCatalog(data); }).catch(error => { if (live)
        setMapError(`Shared map revisions could not be loaded. Showing the bundled map. ${String(error)}`); }); return () => { live = false; }; }, []);
    useEffect(() => { let canceled = false; sharedRequest<SharedCatalog>().then(data => { if (!canceled && Array.isArray(data.revisions))
        setShared(data); }).catch(error => { if (!canceled)
        setSharedError(`Shared revisions could not be loaded. Showing the bundled map content. ${error instanceof Error ? error.message : "Check your connection and sign-in status."}`); }); return () => { canceled = true; }; }, []);
    const published = (revision: SharedRevision) => {
        setShared(s => ({ ...s, revisions: [...s.revisions.filter(r => r.resource !== revision.resource), revision] }));
        if (revision.resource.startsWith("bibliography/"))
            void loadSharedMap().then(setMapCatalog).catch(() => setMapError("The source was saved, but the map’s source review state could not be refreshed. Reload to check it."));
    };
    const [caseData, setCaseData] = useState<Pick<GraphIndex, "caseStudies" | "mapBasis" | "sourceKeys"> | null>(null);
    const index = useMemo(() => ({ ...(mapCatalog?.index ?? baseIndex), ...(mapCatalog?.index ? { caseStudies: caseData?.caseStudies } : caseData), questions: (mapCatalog?.index ?? baseIndex).questions.map(q => {
            const fields = shared.revisions.find(r => r.resource === `questions/${q.id}`)?.fields;
            return fields ? { ...q, label: fields.title, addresses: fields.addresses.split(",").map(s => s.trim()).filter(Boolean), bucket: (fields.bucket || undefined) as typeof q.bucket } : q;
        }) }), [caseData, shared, mapCatalog]);
    const [route, setRoute] = useState<RouteState>(bootRoute);
    const [reader, dispatchCase] = useReducer(caseReducer, null, () => loadCaseDraft());
    const [walkthroughOpen, setWalkthroughOpen] = useState(false);
    const [inviteWalkthrough, setInviteWalkthrough] = useState(() => !loadWorkingView() && (!window.location.hash || window.location.hash === "#/") && shouldInviteWalkthrough());
    const welcomeDialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (!inviteWalkthrough || !welcomeDialog.current)
            return;
        const dialog = welcomeDialog.current;
        if (typeof dialog.showModal === "function")
            dialog.showModal();
        else
            dialog.setAttribute("open", "");
    }, [inviteWalkthrough]);
    const walkthroughSnapshot = useRef<{
        route: RouteState;
        reader: ReaderState | null;
        filters: boolean;
        panel: boolean;
    } | null>(null);
    const [caseError, setCaseError] = useState("");
    const [caseSaved, setCaseSaved] = useState(true);
    const [casePreview, setCasePreview] = useState(false);
    const [creatingCase, setCreatingCase] = useState(false);
    const [createError, setCreateError] = useState("");
    const caseId = route.view.kind === "case" ? route.view.id : undefined;
    const caseShared = route.view.kind === "case" ? route.view.shared : undefined;
    const isCase = route.view.kind === "case";
    const legacyCasePayload = route.view.kind === "case" && route.view.legacyPayload;
    const [caseLoading, setCaseLoading] = useState(false);
    const openedShared = useRef<string | null>(null);
    useEffect(() => {
        if (!isCase) {
            openedShared.current = null;
            return;
        }
        let canceled = false;
        const controller = new AbortController();
        void (async () => {
            try {
                if (legacyCasePayload)
                    throw new Error("Case studies are no longer shared as URL data. Ask the author to share a database-backed revision or export a JSON file.");
                if (reader && !caseShared && (reader.baseline?.identity.revisionId === caseId || caseId === "draft"))
                    return;
                if (reader && caseShared && openedShared.current === caseShared)
                    return;
                const locals = loadCases();
                if (!caseShared && !caseData && !locals.some(d => d.identity.revisionId === caseId))
                    return;
                setCaseError("");
                setCaseLoading(true);
                const doc = caseShared ? await fetchSharedCase(caseShared, controller.signal) : [...(index.caseStudies ?? []), ...locals].find(d => d.identity.revisionId === caseId);
                if (canceled)
                    return;
                if (!doc)
                    throw new Error("This case study is not available in this browser. Ask the author to share the saved revision or export a JSON file.");
                parseCase(doc, index);
                openedShared.current = caseShared ?? null;
                dispatchCase({ type: "open", state: openCase(doc, !caseShared && locals.some(d => d.identity.revisionId === caseId) && !(index.caseStudies ?? []).some(d => d.identity.revisionId === caseId)) });
                setCaseError("");
            }
            catch (error) {
                if (!canceled)
                    setCaseError(String(error));
            }
            finally {
                if (!canceled)
                    setCaseLoading(false);
            }
        })();
        return () => { canceled = true; controller.abort(); };
    }, [caseId, caseShared, legacyCasePayload, isCase, caseData]);
    useEffect(() => {
        let canceled = false;
        fetch(`${import.meta.env.BASE_URL}data/case-data.json`).then(r => { if (!r.ok)
            throw new Error(`HTTP ${r.status}`); return r.json(); }).then(data => {
            if (!canceled)
                setCaseData(data);
        }).catch(() => { if (!canceled)
            setCaseError("Case-study data could not be loaded. Reload to retry; local files and saved drafts remain available."); });
        return () => { canceled = true; };
    }, []);
    useEffect(() => { if (reader && !walkthroughSnapshot.current)
        setCaseSaved(autosaveCase(reader)); }, [reader]);
    const openDocument = (doc: AnalysisDocument, local = false) => {
        if (reader && !walkthroughSnapshot.current)
            autosaveCase(reader);
        dispatchCase({ type: "open", state: openCase(doc, local) });
        setCaseError("");
        setRoute(r => { const next: RouteState = { ...r, view: { kind: "case", id: doc.identity.revisionId, step: 0 } }; if (walkthroughSnapshot.current)
            replaceHash(next);
        else
            pushHash(next); return next; });
    };
    const leaveCase = () => { setCaseError(""); setCasePreview(false); setRoute(r => { const next: RouteState = { ...r, view: { kind: "tree" } }; pushHash(next); return next; }); };
    const columnsKey = route.columns.join(",");
    const graph = useMemo(() => buildGraph(index, columnsKey ? columnsKey.split(",") : []), [columnsKey, index]);
    const [originalProse, setProse] = useState<ProseBundle | null>(null);
    const prose = useMemo(() => {
        const source = mapCatalog?.prose ?? originalProse;
        if (!source)
            return null;
        const updated = { docs: { ...source.docs }, references: { ...source.references } };
        for (const revision of shared.revisions) {
            const [kind, key] = revision.resource.split("/");
            if (kind === "bibliography")
                updated.references[key] = { ...(updated.references[key] ?? { key, title: "", url: "" }), ...revision.fields };
        }
        const revisedSources = new Set(shared.revisions.filter(r => r.resource.startsWith("bibliography/")).map(r => r.resource.split("/")[1]));
        for (const [id, doc] of Object.entries(updated.docs))
            if (doc.cites.some(key => revisedSources.has(key)))
                updated.docs[id] = { ...doc, html: refreshCitations(doc.html, updated.references) };
        for (const revision of shared.revisions) {
            const [kind, key] = revision.resource.split("/");
            if (kind === "questions" && updated.docs[key] && revision.fields.body !== undefined)
                updated.docs[key] = { ...updated.docs[key], html: sharedMarkdown(revision.fields.body, index, updated.references), markdown: revision.fields.body };
        }
        return updated;
    }, [originalProse, shared, index, mapCatalog]);
    const [nodeHover, setNodeHover] = useState<HoverTarget | null>(null);
    const [panelOpen, setPanelOpen] = useState(() => parseHash(window.location.hash).selection.length > 0);
    const [foldAnchor, setFoldAnchor] = useState<string | null>(null);
    const [foldOverrides, setFoldOverrides] = useState<string[]>([]);
    const foldContext = JSON.stringify([route.selection, route.filters.story, route.filters.hidden]);
    useEffect(() => setFoldOverrides([]), [foldContext]);
    const [filterBarOpen, setFilterBarOpen] = useState(() => !window.matchMedia?.(NARROW).matches);
    const [theme, setTheme] = useState<string>(() => document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    const startWalkthrough = () => {
        if (walkthroughSnapshot.current)
            return;
        walkthroughSnapshot.current = { route: structuredClone(route), reader, filters: filterBarOpen, panel: panelOpen };
        setInviteWalkthrough(false);
        dismissWalkthroughInvitation();
        setWalkthroughOpen(true);
    };
    const exitWalkthrough = () => {
        const snapshot = walkthroughSnapshot.current;
        walkthroughSnapshot.current = null;
        setWalkthroughOpen(false);
        setCaseError("");
        setCasePreview(false);
        if (!snapshot)
            return;
        dispatchCase({ type: "restore-reader", state: snapshot.reader });
        setRoute(snapshot.route);
        replaceHash(snapshot.route);
        setFilterBarOpen(snapshot.filters);
        setPanelOpen(snapshot.panel);
    };
    const walkthroughMap = (phase: "entry" | "map" = "map") => {
        if (!walkthroughSnapshot.current)
            return;
        if (phase === "entry" && route.view.kind === "tree")
            return;
        const preset = defaultPreset(index.presets);
        setRoute(r => { const next: RouteState = { ...r, view: { kind: "tree" }, selection: [], columns: [], filters: preset ? parseFilters(preset.query) : DEFAULT_FILTERS }; replaceHash(next); return next; });
        setFilterBarOpen(false);
        setPanelOpen(false);
        setCasePreview(false);
    };
    useEffect(() => {
        const start = () => startWalkthrough();
        window.addEventListener(WALKTHROUGH_REQUEST_EVENT, start);
        return () => window.removeEventListener(WALKTHROUGH_REQUEST_EVENT, start);
    }, [route, reader, filterBarOpen, panelOpen]);
    useEffect(() => {
        let canceled = false;
        fetch(`${import.meta.env.BASE_URL}data/prose.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((data: ProseBundle) => {
            if (!canceled)
                setProse(data);
        })
            .catch((err) => console.error("Could not load prose.json:", err));
        return () => {
            canceled = true;
        };
    }, []);
    useEffect(() => {
        const hot = import.meta.hot;
        if (!import.meta.env.DEV || !hot?.on || !hot.off)
            return;
        const onProse = (data: ProseBundle) => setProse(data);
        const onCaseData = (data: Pick<GraphIndex, "caseStudies" | "mapBasis" | "sourceKeys">) => setCaseData(data);
        hot.on("threatmap:prose", onProse);
        hot.on("threatmap:case-data", onCaseData);
        return () => { hot.off("threatmap:prose", onProse); hot.off("threatmap:case-data", onCaseData); };
    }, []);
    const [devtools, setDevtools] = useState<DevTools | undefined>(undefined);
    useEffect(() => {
        if (!import.meta.env.DEV || import.meta.env.MODE === "test")
            return;
        let stale = false;
        fetch(`${import.meta.env.BASE_URL}__editor/token`)
            .then((r) => (r.ok ? r.json() : null))
            .then(async (data: {
            token?: string;
        } | null) => {
            if (!data?.token || stale)
                return;
            const mod = await import("../dev/editor/mount.js");
            if (!stale)
                setDevtools(mod.create({ token: data.token!, index }));
        })
            .catch(() => {
        });
        return () => {
            stale = true;
        };
    }, []);
    const editable = devtools?.prose;
    useEffect(() => {
        const onPop = () => setRoute((r) => {
            const parsed = parseHash(window.location.hash);
            if (carriesView(window.location.hash))
                return parsed;
            return { ...parsed, filters: r.filters, columns: r.columns };
        });
        window.addEventListener("popstate", onPop);
        window.addEventListener("hashchange", onPop);
        return () => {
            window.removeEventListener("popstate", onPop);
            window.removeEventListener("hashchange", onPop);
        };
    }, []);
    useEffect(() => {
        if (carriesView(window.location.hash))
            replaceHash(route);
    }, [route]);
    useEffect(() => {
        if (route.view.kind !== "case" && !walkthroughSnapshot.current)
            storeWorkingView({ filters: route.filters, columns: route.columns });
    }, [route.filters, route.columns]);
    const setView = useCallback((view: View) => {
        setRoute((r) => {
            const next = { ...r, view, selection: view.kind === "tree" ? r.selection : [] };
            pushHash(next);
            return next;
        });
    }, []);
    const setFilters = useCallback((patch: Partial<FilterState>) => {
        if (patch.story)
            setPanelOpen(true);
        setFoldAnchor(null);
        setRoute((r) => {
            const next = { ...r, filters: { ...r.filters, ...patch } };
            replaceHash(next);
            return next;
        });
    }, []);
    const flipFold = useCallback((key: string, collapsed?: boolean) => {
        setFoldAnchor(key);
        if (collapsed !== undefined)
            setFoldOverrides(keys => collapsed
                ? [...new Set([...keys, key])]
                : keys.filter(k => k !== key && k !== conditionFamily(key)));
        setRoute((r) => {
            let fold = toggleFold(r.filters.fold, key);
            if (collapsed !== undefined) {
                const children = bandDetailOf(graph, `group:${key}`)?.children?.map(child => child.id) ?? [];
                const except = r.filters.fold.except.filter(k => k !== key && !(collapsed && children.includes(k)) && !(!collapsed && !r.filters.fold.all && k === conditionFamily(key)));
                if (r.filters.fold.all !== collapsed)
                    except.push(key);
                fold = { all: r.filters.fold.all, except };
            }
            const next = { ...r, filters: { ...r.filters, fold } };
            replaceHash(next);
            return next;
        });
    }, [graph]);
    const setColumns = useCallback((columns: string[]) => {
        setFoldAnchor(null);
        setRoute((r) => {
            const next = { ...r, columns: isDefaultOrder(index, columns) ? [] : columns };
            replaceHash(next);
            return next;
        });
    }, []);
    const select = useCallback((id: string | string[], additive = false) => {
        setRoute((r) => {
            const ids = (Array.isArray(id) ? id : [id])
                .map((one) => resolveId(graph, one))
                .filter((one): one is string => !!one);
            if (!ids.length)
                return r;
            let selection: string[];
            if (additive) {
                const held = new Set(r.selection.filter((one) => !one.startsWith("group:")));
                const allIn = ids.every((one) => held.has(one));
                for (const one of ids) {
                    if (allIn)
                        held.delete(one);
                    else
                        held.add(one);
                }
                selection = [...held];
            }
            else {
                const same = r.selection.length === ids.length && ids.every((one) => r.selection.includes(one));
                selection = same ? [] : ids;
            }
            const next: RouteState = { ...r, view: { kind: "tree" }, selection };
            setPanelOpen(selection.length > 0);
            pushHash(next);
            return next;
        });
    }, [graph]);
    const clearSelection = useCallback(() => {
        setRoute((r) => {
            if (r.selection.length === 0)
                return r;
            const next = { ...r, selection: [] };
            pushHash(next);
            return next;
        });
    }, []);
    const dismiss = useCallback(() => {
        clearSelection();
        setPanelOpen(false);
    }, [clearSelection]);
    const showDoc = useCallback((doc: Doc, viewState?: Pick<RouteState, "filters" | "columns">) => {
        setRoute((r) => {
            const next: RouteState = {
                ...r,
                filters: viewState?.filters ?? r.filters,
                columns: viewState?.columns ?? r.columns,
                view: doc.view,
                selection: doc.view.kind === "tree" ? resolveSelection(graph, doc.selection) : [],
            };
            setPanelOpen(true);
            pushHash(next);
            return next;
        });
    }, [graph]);
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0)
                return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                return;
            const target = e.target;
            if (!(target instanceof Element))
                return;
            const anchor = target.closest<HTMLAnchorElement>('a[href^="#/"]');
            if (!anchor || anchor.target === "_blank")
                return;
            e.preventDefault();
            const href = anchor.getAttribute("href")!;
            if (href === "#/walkthrough") {
                window.dispatchEvent(new CustomEvent(WALKTHROUGH_REQUEST_EVENT));
                return;
            }
            const parsed = parseHash(href);
            showDoc(parsed, carriesView(href) ? parsed : undefined);
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, [showDoc]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isCase)
                return;
            if (e.key !== "Escape")
                return;
            if (panelOpen)
                setPanelOpen(false);
            else
                clearSelection();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [clearSelection, panelOpen, isCase]);
    const [copied, setCopied] = useState(false);
    const copyLink = () => {
        const url = shareUrl(route);
        const done = () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        };
        const write = navigator.clipboard?.writeText?.(url);
        if (write)
            write.then(done, () => window.prompt("Copy this link", url));
        else
            window.prompt("Copy this link", url);
    };
    const toggleTheme = () => {
        const next = theme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try {
            localStorage.setItem(THEME_KEY, next);
        }
        catch {
        }
        setTheme(next);
    };
    const { bucket, hidden } = route.filters;
    const structural = useMemo(() => ({
        ...DEFAULT_FILTERS,
        bucket,
        hidden,
    }), [bucket, hidden]);
    const kept = useMemo(() => structuralNodes(graph, structural), [graph, structural]);
    const view = useMemo(() => buildGraph(index, columnsKey ? columnsKey.split(",") : [], (n) => kept.has(n.id)), [columnsKey, kept]);
    const visible = useMemo(() => searchNodes(view, route.filters.query), [view, route.filters.query]);
    const hits = useMemo(() => searchHits(view, route.filters.query), [view, route.filters.query]);
    const selection = useMemo(() => resolveSelection(graph, route.selection), [graph, route.selection]);
    const held = useMemo(() => heldNodes(graph, route.filters), [graph, route.filters]);
    const assumed = useMemo(() => shapeOnlyNodes(graph, route.filters), [graph, route.filters]);
    const story = useMemo(() => route.filters.story
        ? traceStories(view, selection, route.filters.story, { assumed })
        : null, [view, selection, route.filters.story, assumed]);
    const hideable = useMemo(() => selection.filter((id) => graph.byId.has(id)), [graph, selection]);
    const openBands = useMemo(() => {
        const automatic = bandsOf(view, [
            ...selection.flatMap((id) => (view.byId.has(id) ? [id] : [])),
            ...(story ? story.nodes : []),
        ]);
        for (const key of foldOverrides) {
            automatic.delete(key);
            for (const child of bandDetailOf(graph, `group:${key}`)?.children ?? [])
                automatic.delete(child.id);
        }
        return automatic;
    }, [view, selection, story, graph, foldOverrides]);
    const foldedKey = useMemo(() => [...foldedKeys(view, route.filters.fold, openBands)].sort().join("\n"), [view, route.filters.fold, openBands]);
    const folded = useMemo(() => new Set(foldedKey ? foldedKey.split("\n") : []), [foldedKey]);
    const canvas = useMemo(() => foldGraph(view, folded, columnsKey ? columnsKey.split(",") : []), [view, folded, columnsKey]);
    const canvasVisible = useMemo(() => foldedSet(canvas.fold, visible), [canvas, visible]);
    const canvasHits = useMemo(() => foldedSet(canvas.fold, hits), [canvas, hits]);
    const canvasHeld = useMemo(() => foldedSet(canvas.fold, held), [canvas, held]);
    const canvasSelection = useMemo(() => {
        const mapped = foldedSelection(canvas.fold, selection);
        if (selection.length === 1 && selection[0]!.startsWith("group:")) {
            const key = selection[0]!.slice("group:".length);
            for (const node of canvas.index.nodes) {
                if (!node.fold && canvasVisible.has(node.id) && groupKeyOf(node) === key) {
                    mapped.push(node.id);
                }
            }
        }
        return mapped;
    }, [canvas, selection, canvasVisible]);
    const canvasStory = useMemo(() => story
        ? {
            nodes: foldedSet(canvas.fold, story.nodes),
            edges: foldedSet(canvas.fold, story.edges),
        }
        : null, [canvas, story]);
    const hideSelected = useCallback((mode: HiddenMode) => {
        setRoute((r) => {
            const ids = resolveSelection(graph, r.selection).filter((id) => graph.byId.has(id));
            if (!ids.length)
                return r;
            const next: RouteState = {
                ...r,
                selection: [],
                filters: { ...r.filters, hidden: [...r.filters.hidden, { ids, mode }] },
            };
            setPanelOpen(false);
            pushHash(next);
            return next;
        });
    }, [graph]);
    const here = useMemo<Doc>(() => ({ view: route.view, selection }), [route.view, selection]);
    const nav = useDocHistory(here, showDoc);
    const proseHover = useProseHover(index, prose);
    const canvasHover: HoverContent | null = useMemo(() => {
        if (!nodeHover)
            return null;
        if (nodeHover.kind === "node") {
            const { node } = nodeHover;
            return {
                kicker: `${node.id} · ${index.layers.find((l) => l.name === node.layer)?.label ?? ""}`,
                title: node.label,
                body: node.lead,
                flags: statusLabel(node),
            };
        }
        if (nodeHover.kind === "gate") {
            const { gate } = nodeHover;
            const members = gate.edgeIds
                .map((id) => canvas.edgeById.get(id)?.from)
                .filter((id): id is string => !!id);
            const open = gate.declared - members.length;
            const named = members.map((id) => canvas.byId.get(id)?.label ?? id).join(" AND ");
            return {
                kicker: `AND · ${gate.declared} of ${gate.gatedId}'s requirements`,
                title: open ? `${named} AND ${open} filtered out` : named,
                meta: "click to open the conjunction",
                metaAlign: "end",
            };
        }
        if (nodeHover.kind === "band") {
            const { group, count } = nodeHover;
            const bandGroup = bandDetailOf(graph, `group:${group}`);
            const phase = bandGroup ? undefined : index.taxonomies.phase?.values[group];
            const member = bandGroup
                ? graph.byId.get(bandGroup.members.find((id) => graph.byId.has(id)) ?? "")
                : undefined;
            const noun = (member ? (index.layers.find((l) => l.name === member.layer)?.label ?? member.layer) : "stage").toLowerCase();
            return {
                kicker: `${bandGroup ? "Display family" : `Phase ${group}`} · ${count} ${noun}${count === 1 ? "" : "s"}`,
                title: bandGroup?.label ?? phase?.label ?? group,
                body: phase?.description ?? bandGroup?.lead,
                memberClaim: bandGroup?.kind === "partition"
                    ? `Exactly one of these holds${bandGroup.subject ? ` for ${bandGroup.subject}` : ""}.`
                    : bandGroup?.kind === "classifying"
                        ? "Any number of these can hold at once."
                        : undefined,
                members: bandGroup && bandGroup.kind !== "scale"
                    ? bandGroup.members.map((id) => ({
                        id,
                        label: graph.byId.get(id)?.label ?? id,
                        hidden: !view.drawn.has(id),
                    }))
                    : undefined,
                meta: count ? `click for details · Shift-click to select ${count}` : "click for details",
                metaAlign: "end",
            };
        }
        const gathered = canvas.fold?.edges.get(nodeHover.id);
        if (gathered) {
            const at = canvas.edgeById.get(nodeHover.id);
            const from = at ? canvas.byId.get(at.from) : undefined;
            const to = at ? canvas.byId.get(at.to) : undefined;
            return {
                kicker: `${gathered.length} relation${gathered.length === 1 ? "" : "s"} · gathered`,
                title: `${from?.label ?? at?.from ?? "?"} → ${to?.label ?? at?.to ?? "?"}`,
                body: gathered
                    .map((id) => graph.edgeById.get(id))
                    .filter((e): e is NonNullable<typeof e> => !!e)
                    .map((e) => `${graph.byId.get(e.from)?.label ?? e.from} → ${graph.byId.get(e.to)?.label ?? e.to}`)
                    .join("; "),
                meta: "click to select the relations it stands for",
                metaAlign: "end",
            };
        }
        const edge = graph.edgeById.get(nodeHover.id);
        if (!edge)
            return null;
        const doc = index.edgeDocs[nodeHover.id];
        const from = graph.byId.get(edge.from);
        const to = graph.byId.get(edge.to);
        return {
            kicker: `${edge.from} enables ${edge.to}`,
            title: doc?.label ?? `${from?.label ?? edge.from} → ${to?.label ?? edge.to}`,
            body: doc?.lead,
            flags: doc ? statusLabel(doc) : "no argument recorded",
        };
    }, [graph, nodeHover, view]);
    const hoverContent: HoverContent | null = proseHover.content ?? canvasHover;
    const hoverX = proseHover.content ? proseHover.x : (nodeHover?.x ?? 0);
    const hoverY = proseHover.content ? proseHover.y : (nodeHover?.y ?? 0);
    const hoverVia = proseHover.content ? proseHover.via : nodeHover?.via;
    const filtersActive = hasActiveFilters(route.filters);
    const createCase = (freshSelection?: string[]) => {
        try {
            if (!caseData)
                throw new Error("Case-study map references are still loading. Try again in a moment.");
            const captureGraph = freshSelection ? buildGraph(index) : buildGraph(index, route.columns, n => kept.has(n.id) || assumed.has(n.id));
            const doc = deriveCaseStudy(captureGraph, index, freshSelection ?? selection, freshSelection ? "all" : route.filters.story ?? "all");
            if (!freshSelection)
                doc.content.view = { ...route, view: { kind: "tree" } };
            const state = openCase(doc);
            state.baseline = null;
            state.savePolicy = "new";
            dispatchCase({ type: "open", state });
            setCaseError("");
            setCreatingCase(false);
            setRoute(r => { const next: RouteState = { ...r, view: { kind: "case", id: "draft", step: 0 } }; pushHash(next); return next; });
        }
        catch (error) {
            if (freshSelection)
                setCreateError(String(error));
            else
                setCaseError(String(error));
        }
    };
    const tabs: Array<{
        key: string;
        label: string;
        view: View;
    }> = [
        { kind: "tree" } as View,
        { kind: "bibliography" } as View,
        ...index.pages.filter(p => p.slug !== "worked-examples" && p.slug !== "tutorial").map((p) => ({ kind: "page", slug: p.slug }) as View),
    ].map((view) => ({ key: viewKey(view), label: viewLabel(view, index.pages), view }));
    const caseMenu = (<CaseMenu onCreate={() => { setCreatingCase(true); setCreateError(""); }} index={index} reader={reader} onOpen={openDocument} onResume={() => {
            const draft = loadCaseDraft();
            if (!draft) {
                setCaseError("No recoverable case-study draft is saved in this browser.");
                return;
            }
            dispatchCase({ type: "open", state: draft });
            setRoute(r => { const next: RouteState = { ...r, view: { kind: "case", id: draft.baseline?.identity.revisionId ?? "draft", step: 0 } }; pushHash(next); return next; });
        }}/>);
    const activeKey = isCase ? "tree" : viewKey(route.view);
    const contextIds = new Set(index.nodes.filter(n => n.layer === "component" || n.layer === "stage").map(n => n.id));
    const contextHidden = route.filters.hidden.some(s => s.mode !== "held" && expandSet(graph, s.ids).some(id => contextIds.has(id)));
    const toggleContext = () => {
        const hidden = route.filters.hidden.flatMap(s => {
            if (!contextHidden || s.mode === "held")
                return [s];
            const ids = s.ids.flatMap(id => {
                const members = expandSet(graph, [id]);
                return members.some(member => contextIds.has(member)) ? members.filter(member => !contextIds.has(member)) : [id];
            });
            return ids.length ? [{ ...s, ids }] : [];
        });
        if (!contextHidden)
            hidden.push({ mode: "shape", ids: [...contextIds] });
        setFilters({ hidden });
    };
    const openOverview = () => {
        const preset = defaultPreset(index.presets);
        setRoute(r => {
            const next: RouteState = { ...r, view: { kind: "tree" }, selection: [], columns: [], filters: preset ? parseFilters(preset.query) : DEFAULT_FILTERS };
            pushHash(next);
            return next;
        });
        setPanelOpen(false);
    };
    const splash = inviteWalkthrough && !walkthroughOpen && (<dialog ref={welcomeDialog} class="welcome-splash" aria-labelledby="welcome-title" onCancel={() => { dismissWalkthroughInvitation(); setInviteWalkthrough(false); }}>
      <section class="welcome-card">
        <h1 id="welcome-title">Welcome to {profile.title}</h1>
        <p>Explore how an agent's access can lead to harmful actions and outcomes.</p>
        <p>The tutorial introduces the map's tools for browsing and analyzing loss-of-control scenarios. You can also explore independently, browsing the map or reading case studies.</p>
        <div class="welcome-actions">
          <button class="btn" onClick={startWalkthrough}>Start tutorial</button>
          <button class="btn" onClick={() => { dismissWalkthroughInvitation(); setInviteWalkthrough(false); }}>Explore independently</button>
        </div>
        <p class="welcome-hint">You can open the tutorial at any time using the Tutorial button at the top of the map.</p>
      </section>
    </dialog>);
    return (<>
    <div class="shell">
      <header>
        <h1>{profile.title}</h1>
        <span class="spacer"/>
        {route.view.kind === "tree" && caseMenu}
        {route.view.kind === "tree" && <button class="btn" onClick={openOverview} title="Show the full range of pathways with context columns hidden">Map overview</button>}
        {route.view.kind === "tree" && <button class="btn" data-walkthrough="map-context" aria-pressed={!contextHidden} onClick={toggleContext} title="Show or hide component and stage columns without changing the map's prerequisites">{contextHidden ? "Show context" : "Hide context"}</button>}
        
        {route.view.kind === "tree" && (<button data-walkthrough="map-filters" class={`btn ${!filterBarOpen && filtersActive ? "set" : ""}`} aria-expanded={filterBarOpen ? "true" : "false"} aria-controls="filter-bar" onClick={() => setFilterBarOpen((open) => !open)} title={filterBarOpen
                ? "Put the filter bar away and give the room to the canvas"
                : filtersActive
                    ? "Show the filter bar — it is still narrowing the map"
                    : "Show the filter bar"}>
            {filterBarOpen ? "Hide filters" : "Show filters"}
          </button>)}
        <button class="btn" data-walkthrough={isCase ? "case-share" : "map-share"} onClick={() => { if (isCase)
        setCasePreview(true);
    else
        copyLink(); }} title="Copy a view link with the selection, filters and column order. Generated stories are recalculated from the map when opened.">
          {copied ? "Link copied" : "Copy link"}
        </button>
        <button class="btn" onClick={startWalkthrough}>Tutorial</button>
        {(shared.editable || mapCatalog?.editable) && <button class="btn" onClick={() => setChangeLogOpen(open => !open)}>Change log</button>}
        {mapCatalog?.editable && route.view.kind === "tree" && <button class="btn" onClick={() => setMapEditId(selection.find(id => graph.byId.has(id)) ?? index.nodes.find(n => n.layer === "affordance")!.id)}>Edit map</button>}
        {devtools?.DatasetTools&&route.view.kind==='tree'&&<devtools.DatasetTools onOpen={openDocument}/>}
        <button class="btn" data-walkthrough="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </header>
      {mapError && <div class="shared-notice" role="status">{mapError}<button onClick={() => setMapError("")}>Dismiss</button></div>}
      {route.view.kind === "bibliography" && sharedError && <div class="shared-notice" role="status">{sharedError}<button onClick={() => setSharedError("")}>Dismiss</button></div>}

      <div class="tabs" role="tablist">
        {tabs.map((t) => (<button key={t.key} class="tab" role="tab" aria-selected={activeKey === t.key ? "true" : "false"} onClick={() => setView(t.view)}>
            {t.label}
          </button>))}
      </div>

      {creatingCase && (route.view.kind === "tree" || isCase) && <form class="case-create-form" onSubmit={e => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                createCase([String(data.get("premise")), String(data.get("outcome"))]);
            }}>
        <strong>Create a case study</strong>
        <p>Choose a deployment premise and an outcome. We will trace a story through the map, ready for your notes and edits.</p>
        <div class="case-create-fields">
          <label>Deployment premise<select name="premise" required defaultValue={selection.find(id => graph.byId.get(id)?.layer === "stage") ?? ""}><option value="" disabled>Choose a premise</option>{index.nodes.filter(n => n.layer === "stage").map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
          <label>Outcome<select name="outcome" required defaultValue={selection.find(id => graph.byId.get(id)?.layer === "event") ?? ""}><option value="" disabled>Choose an outcome</option>{index.nodes.filter(n => n.layer === "event").map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
          <button class="btn" type="submit" disabled={!caseData}>Create case study</button>
          <button class="btn" type="button" onClick={() => setCreatingCase(false)}>Cancel</button>
        </div>
        {createError && <p role="alert">{createError}</p>}
      </form>}

      
      <main class={panelOpen && route.view.kind === "tree" ? "paneled" : undefined}>
        {changeLogOpen && <ChangeLog onClose={() => setChangeLogOpen(false)} onRestore={id => { setMapRestoreId(id); setChangeLogOpen(false); }}/>}
        {mapEditId && <section class="doc admin-console"><SharedMapEditor id={mapEditId} onPublished={setMapCatalog} onClose={() => setMapEditId(null)}/></section>}
        {mapRestoreId && <section class="doc admin-console"><MapRestoreReview revisionId={mapRestoreId} onPublished={setMapCatalog} onClose={() => setMapRestoreId(null)}/></section>}
        {caseError && <div class="case-error" role="alert">{caseError}<button onClick={leaveCase}>Return to map</button></div>}
        {isCase && (!reader || caseLoading) && !caseError && <p role="status">Loading case study…</p>}
        {isCase && reader && !caseLoading && !caseError && <CaseWorkspace toolbarStart={caseMenu} actions={<CaseActions localCases={devtools?.localCases} index={index} prose={prose} reader={reader} dispatch={dispatchCase} showPreview={casePreview} onShare={() => setCasePreview(true)} onPreviewClose={() => setCasePreview(false)} onSaved={doc => setRoute(r => {
                    if (r.view.kind !== "case")
                        return r;
                    const next: RouteState = { ...r, view: { kind: "case", id: doc.identity.revisionId, step: r.view.step } };
                    replaceHash(next);
                    return next;
                })}/>} index={index} prose={prose} reader={reader} dispatch={dispatchCase} step={route.view.kind === "case" ? route.view.step : 0} saved={caseSaved} onLeave={leaveCase} onStep={step => setRoute(r => {
                if (r.view.kind !== "case")
                    return r;
                const next = { ...r, view: { ...r.view, step } };
                replaceHash(next);
                return next;
            })}/>}
        {route.view.kind === "tree" && (<>
            <div class="panelwrap">
              {filterBarOpen && (<Filters graph={graph} filters={route.filters} onChange={setFilters} visibleCount={visible.size} shownCount={view.drawn.size} totalCount={graph.drawn.size} hideable={hideable} onHideSelected={hideSelected} onSelectNodes={(ids) => select(ids, false)} columnsMoved={!isDefaultOrder(index, route.columns)} onResetColumns={() => setColumns([])} storyModeMatters={story ? story.modeMatters : null}/>)}
              <GraphCanvas graph={canvas} visible={canvasVisible} hits={canvasHits} held={canvasHeld} selection={canvasSelection} onSelect={select} onClear={dismiss} onHover={setNodeHover} onArrange={setColumns} partialGates={route.filters.showPartialGates} story={canvasStory} onToggleFold={flipFold} anchor={foldAnchor}>
                
                {!panelOpen && (<div class="panelctl">
                    <DocHistoryButtons graph={graph} nav={nav}/>
                    <button class="showpanel" onClick={() => setPanelOpen(true)} title="Show the detail panel">
                      ‹ Details
                    </button>
                  </div>)}
              </GraphCanvas>
            </div>
            {panelOpen && (<Panel graph={graph} prose={prose} selection={selection} nav={nav} onCanvas={kept} selectable={visible} onSelectContents={(ids) => select(ids, false)} onSelect={(id) => select(id, false)} onClose={() => setPanelOpen(false)} folded={folded} onToggleFold={flipFold} editable={editable} devtools={devtools} story={story} onSaveCase={() => createCase()}/>)}
          </>)}

        {route.view.kind === "bibliography" && <BibliographyView prose={prose} catalog={shared} onPublished={published} requestedSource={route.view.source}/>}
        {route.view.kind === "questions" && <div class="doc"><h2>Research questions</h2><p>This section has been retired. Existing research notes remain stored.</p><button class="btn" onClick={() => setView({ kind: "tree" })}>Open the map</button></div>}

        {route.view.kind === "page" && (<PageView graph={graph} prose={prose} nav={nav} slug={route.view.slug} editable={editable}/>)}
      </main>

      <HoverCard content={hoverContent} x={hoverX} y={hoverY} via={hoverVia}/>
      
      <TipLayer />
      {walkthroughOpen && <Walkthrough open onExit={exitWalkthrough} onOpenMap={walkthroughMap}/>}
    </div>
    {splash}
    </>);
}
