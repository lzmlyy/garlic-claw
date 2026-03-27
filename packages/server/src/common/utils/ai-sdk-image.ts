/**
 * AI SDK 图片输入转换工具
 *
 * 输入:
 * - 图片 data URL 或远程 URL
 *
 * 输出:
 * - AI SDK 可消费的远程 URL 或二进制内容
 *
 * 预期行为:
 * - `data:` URL 在进入 AI SDK 前转成 ArrayBuffer
 * - 远程 URL 保持字符串形式
 */

/**
 * 将图片字符串转换为 AI SDK 可消费的输入。
 * @param image 图片 data URL 或远程 URL
 * @returns 远程 URL 或二进制图片内容
 */
export function toAiSdkImageInput(image: string): string | ArrayBuffer {
  if (!image.startsWith('data:')) {
    return image;
  }

  const matched = /^data:([^;]+);base64,(.+)$/u.exec(image);
  if (!matched) {
    throw new Error('Unsupported image data URL');
  }

  const binary = Buffer.from(matched[2], 'base64');
  return binary.buffer.slice(
    binary.byteOffset,
    binary.byteOffset + binary.byteLength,
  );
}
