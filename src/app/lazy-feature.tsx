import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
export function lazyFeature<P extends object>(load: () => Promise<{
    default: ComponentType<P>;
}>, label: string) {
    let loaded: ComponentType<P> | undefined;
    let pending: Promise<ComponentType<P>> | undefined;
    return function LazyFeature(props: P) {
        const [state, setState] = useState<{
            component?: ComponentType<P>;
            failed?: boolean;
        }>(() => ({ component: loaded }));
        useEffect(() => {
            if (state.component || state.failed)
                return;
            let active = true;
            pending ??= load().then(module => (loaded = module.default)).catch(error => {
                pending = undefined;
                throw error;
            });
            pending.then(component => { if (active)
                setState({ component }); }, () => {
                if (active)
                    setState({ failed: true });
            });
            return () => { active = false; };
        }, [state.component, state.failed]);
        if (state.failed)
            return <div role="alert">Could not load {label}. <button onClick={() => setState({})}>Try again</button></div>;
        const Feature = state.component;
        return Feature ? <Feature {...props}/> : <p role="status">Loading {label}…</p>;
    };
}
