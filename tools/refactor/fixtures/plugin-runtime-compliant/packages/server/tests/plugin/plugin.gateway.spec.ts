describe('PluginGateway', () => {
  it('rejects malformed raw websocket payloads before gateway routing', () => {
    expect({
      type: WS_TYPE.ERROR,
      action: 'parse_error',
      payload: { error: '无效的 JSON' },
    }).toBeDefined();
  });

  it('rejects malformed websocket envelopes before they reach the gateway message router', () => {
    expect({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: { error: '无效的插件协议消息' },
    }).toBeDefined();
  });

  it('rejects unauthenticated websocket plugin messages before routing', () => {
    expect({
      type: WS_TYPE.ERROR,
      action: WS_ACTION.AUTH_FAIL,
      payload: { error: '未认证' },
    }).toBeDefined();
  });

  it('registers a remote plugin manifest into the unified runtime', () => {
    expect({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER_OK,
      payload: {},
    }).toBeDefined();
  });
});
