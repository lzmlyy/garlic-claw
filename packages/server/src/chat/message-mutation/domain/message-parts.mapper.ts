import {
  serializeMessageParts,
  type ChatMessagePart,
} from '@garlic-claw/shared';
import { mapDtoParts } from '../../chat-message.helpers';
import type { SendMessagePartDto } from '../../dto/chat.dto';

export class MessagePartsMapper {
  fromDtoParts(parts: SendMessagePartDto[] | undefined): ChatMessagePart[] | undefined {
    return parts ? mapDtoParts(parts) : undefined;
  }

  toCreatePartsJson(parts: ChatMessagePart[] | null | undefined): string | null | undefined {
    if (parts === undefined) {
      return undefined;
    }
    if (parts === null) {
      return null;
    }

    return parts.length > 0
      ? serializeMessageParts(parts)
      : null;
  }

  toNullablePartsJson(parts: ChatMessagePart[] | null | undefined): string | null {
    if (!parts || parts.length === 0) {
      return null;
    }

    return serializeMessageParts(parts);
  }

  toUpdatePartsJson(parts: ChatMessagePart[]): string {
    return serializeMessageParts(parts);
  }
}
