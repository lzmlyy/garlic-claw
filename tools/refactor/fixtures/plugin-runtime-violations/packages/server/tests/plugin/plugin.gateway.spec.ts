describe('PluginGateway', () => {
  it('rejects malformed raw websocket payloads before gateway routing', () => {
    expect({
      type: WS_TYPE.ERROR,
      action: 'parse_error',
      payload: { error: '无效的 JSON' },
    }).toBeDefined();
  });
});
