'use client';

import { useEffect, useState } from 'react';
import type { ImageQueryType } from '@bini/types';
import { fetchGameImage } from '../lib/api';

type State =
  | { kind: 'loading' }
  | { kind: 'image'; url: string }
  | { kind: 'placeholder' };

export function GameImage({ query, type }: { query: string; type: ImageQueryType }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    fetchGameImage(query, type)
      .then((res) => {
        if (!alive) return;
        setState(
          res.imageUrl ? { kind: 'image', url: res.imageUrl } : { kind: 'placeholder' },
        );
      })
      .catch(() => {
        if (alive) setState({ kind: 'placeholder' });
      });
    return () => {
      alive = false;
    };
  }, [query, type]);

  if (state.kind === 'loading') {
    return (
      <div data-testid="image-skeleton" className="h-40 w-full animate-pulse bg-gray-200" />
    );
  }
  if (state.kind === 'placeholder') {
    return (
      <div
        data-testid="image-placeholder"
        className="flex h-40 w-full items-center justify-center bg-gray-100 text-sm text-gray-400"
      >
        이미지 없음
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={state.url}
      alt={query}
      className="h-40 w-full object-cover"
      onError={() => setState({ kind: 'placeholder' })}
    />
  );
}
