'use client';

import { Component, type ReactNode } from 'react';

/** Keeps the rest of the UI (search, inspector) alive if the map throws. */
export class MapErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[map] crashed', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
