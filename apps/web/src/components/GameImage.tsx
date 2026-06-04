'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
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
    <div className="relative h-40 w-full">
      <Image
        src={state.url}
        alt={query}
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
        onError={() => setState({ kind: 'placeholder' })}
      />
    </div>
  );
}
