import { ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces';
import { CreateAutomationDto } from './automation.dto';

describe('CreateAutomationDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateAutomationDto,
    data: '',
  };

  it('accepts a valid automation payload under the global validation pipe', async () => {
    const payload = {
      name: 'Smoke Automation',
      trigger: {
        type: 'manual',
      },
      actions: [],
    };

    await expect(pipe.transform(payload, metadata)).resolves.toEqual(
      expect.objectContaining({
        name: 'Smoke Automation',
        actions: [],
        trigger: expect.objectContaining({
          type: 'manual',
        }),
      }),
    );
  });
});
