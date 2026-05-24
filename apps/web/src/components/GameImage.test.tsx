import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GameImage } from './GameImage';
import * as api from '../lib/api';

afterEach(() => vi.restoreAllMocks());

describe('GameImage', () => {
  it('로딩 중에는 스켈레톤을 보여준다', () => {
    vi.spyOn(api, 'fetchGameImage').mockReturnValue(new Promise(() => {}));
    render(<GameImage query="원신 게임" type="game" />);
    expect(screen.getByTestId('image-skeleton')).toBeInTheDocument();
  });

  it('성공 시 이미지를 보여준다', async () => {
    vi.spyOn(api, 'fetchGameImage').mockResolvedValue({
      query: '원신 게임', imageUrl: 'https://i/x.jpg', status: 'found',
    });
    render(<GameImage query="원신 게임" type="game" />);
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://i/x.jpg'),
    );
  });

  it('결과 없음 시 플레이스홀더를 보여준다', async () => {
    vi.spyOn(api, 'fetchGameImage').mockResolvedValue({
      query: '원신 게임', imageUrl: null, status: 'not_found',
    });
    render(<GameImage query="원신 게임" type="game" />);
    await waitFor(() =>
      expect(screen.getByTestId('image-placeholder')).toBeInTheDocument(),
    );
  });

  it('이미지 로드 실패(onError) 시 플레이스홀더로 대체한다', async () => {
    vi.spyOn(api, 'fetchGameImage').mockResolvedValue({
      query: '원신 게임', imageUrl: 'https://i/broken.jpg', status: 'found',
    });
    render(<GameImage query="원신 게임" type="game" />);
    const img = await screen.findByRole('img');
    fireEvent.error(img);
    await waitFor(() =>
      expect(screen.getByTestId('image-placeholder')).toBeInTheDocument(),
    );
  });
});
