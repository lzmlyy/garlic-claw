import * as fs from 'fs';
import * as path from 'path';
import { ModelCapabilitiesStorage } from './model-capabilities.storage';

interface PersistedCapabilitiesJson {
  reasoning: boolean;
  toolCall: boolean;
  input: {
    text: boolean;
    image: boolean;
  };
  output: {
    text: boolean;
    image: boolean;
  };
}

describe('ModelCapabilitiesStorage', () => {
  const tempConfigPath = path.join(
    process.cwd(),
    'tmp',
    'model-capabilities.storage.spec.json',
  );

  afterEach(() => {
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  });

  it('normalizes legacy capability fields when loading persisted config', () => {
    fs.mkdirSync(path.dirname(tempConfigPath), { recursive: true });
    fs.writeFileSync(
      tempConfigPath,
      JSON.stringify(
        {
          version: 1,
          lastUpdated: '2026-03-26T10:00:00.000Z',
          models: [
            {
              providerId: 'nvidia',
              modelId: 'qwen/qwen3.5-122b-a10b',
              capabilities: {
                temperature: true,
                reasoning: false,
                attachment: false,
                toolCall: true,
                input: {
                  text: true,
                  image: true,
                  audio: false,
                  video: false,
                  pdf: false,
                },
                output: {
                  text: true,
                  image: false,
                  audio: false,
                  video: false,
                  pdf: false,
                },
              },
              updatedAt: '2026-03-26T10:00:00.000Z',
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const storage = new ModelCapabilitiesStorage();
    Reflect.set(storage, 'configPath', tempConfigPath);

    storage.onModuleInit();

    expect(
      storage.loadCapabilities('nvidia', 'qwen/qwen3.5-122b-a10b'),
    ).toEqual({
      reasoning: false,
      toolCall: true,
      input: {
        text: true,
        image: true,
      },
      output: {
        text: true,
        image: false,
      },
    });

    const persisted = JSON.parse(
      fs.readFileSync(tempConfigPath, 'utf-8'),
    ) as {
      models: Array<{
        capabilities: PersistedCapabilitiesJson;
      }>;
    };

    expect(persisted.models[0]?.capabilities).toEqual({
      reasoning: false,
      toolCall: true,
      input: {
        text: true,
        image: true,
      },
      output: {
        text: true,
        image: false,
      },
    });
  });
});
