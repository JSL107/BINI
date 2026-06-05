import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

describe('ImagesController', () => {
  function build() {
    const resolve = jest.fn().mockResolvedValue({
      query: 'x',
      imageUrl: null,
      status: 'not_found',
    });
    const service = { resolve } as unknown as ImagesService;
    return { controller: new ImagesController(service), resolve };
  }

  // 컨트롤러는 verifyText=query 옵션을 항상 함께 전달한다 — fallback fetch 시
  // 출처 페이지 title 매칭으로 회사명/일반어 noise를 컷하기 위한 보안 옵션.
  // 모든 호출 검증이 3-argument form이 되어야 한다.
  it('q와 type을 서비스에 전달한다 (verifyText 포함)', async () => {
    const { controller, resolve } = build();
    await controller.getImage('원신 게임', 'game');
    expect(resolve).toHaveBeenCalledWith('원신 게임', 'game', {
      verifyText: '원신 게임',
    });
  });

  it('type이 company면 company로 전달한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage('넥슨', 'company');
    expect(resolve).toHaveBeenCalledWith('넥슨', 'company', {
      verifyText: '넥슨',
    });
  });

  it('type 미지정/기타 값은 game으로 처리한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage('원신 게임', undefined);
    await controller.getImage('원신 게임', 'xyz');
    expect(resolve).toHaveBeenNthCalledWith(1, '원신 게임', 'game', {
      verifyText: '원신 게임',
    });
    expect(resolve).toHaveBeenNthCalledWith(2, '원신 게임', 'game', {
      verifyText: '원신 게임',
    });
  });

  it('배열 query param은 첫 값을 쓰고 q는 trim한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage(['  원신 게임  ', 'b'], ['company', 'game']);
    expect(resolve).toHaveBeenCalledWith('원신 게임', 'company', {
      verifyText: '원신 게임',
    });
  });

  it('type의 앞뒤 공백을 제거하고 판정한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage('넥슨', '  company  ');
    expect(resolve).toHaveBeenCalledWith('넥슨', 'company', {
      verifyText: '넥슨',
    });
  });
});
