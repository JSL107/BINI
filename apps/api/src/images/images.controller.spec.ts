import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

describe('ImagesController', () => {
  function build() {
    const resolve = jest.fn().mockResolvedValue({
      query: 'x', imageUrl: null, status: 'not_found',
    });
    const service = { resolve } as unknown as ImagesService;
    return { controller: new ImagesController(service), resolve };
  }

  it('q와 type을 서비스에 전달한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage('원신 게임', 'game');
    expect(resolve).toHaveBeenCalledWith('원신 게임', 'game');
  });

  it('type이 company면 company로 전달한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage('넥슨', 'company');
    expect(resolve).toHaveBeenCalledWith('넥슨', 'company');
  });

  it('type 미지정/기타 값은 game으로 처리한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage('원신 게임', undefined);
    await controller.getImage('원신 게임', 'xyz');
    expect(resolve).toHaveBeenNthCalledWith(1, '원신 게임', 'game');
    expect(resolve).toHaveBeenNthCalledWith(2, '원신 게임', 'game');
  });

  it('배열 query param은 첫 값을 쓰고 q는 trim한다', async () => {
    const { controller, resolve } = build();
    await controller.getImage(['  원신 게임  ', 'b'], ['company', 'game']);
    expect(resolve).toHaveBeenCalledWith('원신 게임', 'company');
  });
});
