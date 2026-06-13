import { BadRequestException, Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import { MobileRequestRepository } from './mobile-request.repository';

@Injectable()
export class MobileGeoHelpers {
  constructor(private readonly repo: MobileRequestRepository) {}

  public normalizePhone(value?: string | null): string | null {
    const digits = String(value ?? '').replace(/\D+/g, '');
    if (!digits) {
      return null;
    }
    if (digits.length === 9 && digits.startsWith('0')) {
      return digits.slice(1);
    }
    if (digits.length > 8 && digits.startsWith('591')) {
      return digits.slice(-8);
    }
    return digits;
  }

  public buildRequestTitle(params: {
    title?: string | null;
    description?: string | null;
    fallbackCategory: string;
  }) {
    const explicitTitle = params.title?.trim();
    if (explicitTitle) {
      return explicitTitle;
    }

    const description = params.description?.trim() ?? '';
    if (description) {
      if (description.length <= 64) {
        return description;
      }
      return `${description.slice(0, 61).trim()}...`;
    }

    return `Solicitud de ${params.fallbackCategory.toLowerCase()}`;
  }

  public extractTopCategories(
    workerRows: Array<{ skills?: string[] | null }>,
  ) {
    const counter = new Map<string, number>();

    for (const row of workerRows) {
      for (const skill of row.skills ?? []) {
        counter.set(skill, (counter.get(skill) ?? 0) + 1);
      }
    }

    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill]) => skill);
  }

  public normalizeAiCategories(
    input: unknown,
    fallbackCategory: string,
  ): Array<{ id: string; name: string; confidence: number }> {
    if (!Array.isArray(input) || input.length === 0) {
      return [
        {
          id: this.repo.toCategoryId(fallbackCategory),
          name: fallbackCategory.trim() || 'General',
          confidence: 0.5,
        },
      ];
    }

    const normalized: Array<{ id: string; name: string; confidence: number }> =
      [];
    const seen = new Set<string>();
    for (const item of input) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const data = item as Record<string, unknown>;
      const rawName = String(
        data.name ?? data.nombre ?? fallbackCategory ?? 'General',
      ).trim();
      const safeName = rawName || 'General';
      const rawId = String(data.id ?? this.repo.toCategoryId(safeName))
        .trim()
        .toLowerCase();
      const id = rawId || this.repo.toCategoryId(safeName);
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      const confidence = Number(data.confidence ?? data.confianza ?? 0.5);
      normalized.push({
        id,
        name: safeName,
        confidence: Number.isFinite(confidence)
          ? Math.max(0, Math.min(1, confidence))
          : 0.5,
      });
    }

    if (normalized.length === 0) {
      return [
        {
          id: this.repo.toCategoryId(fallbackCategory),
          name: fallbackCategory.trim() || 'General',
          confidence: 0.5,
        },
      ];
    }

    return normalized;
  }

  public validateBase64Images(input: unknown, limit: number): string[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const values = input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);

    if (values.length > limit) {
      throw new BadRequestException(`Maximum ${limit} images are allowed`);
    }

    for (const value of values) {
      this.ensureDataUri(value);
    }

    return values;
  }

  public ensureDataUri(value: string): void {
    const pattern = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\n\r]+$/;
    if (!pattern.test(value)) {
      throw new UnsupportedMediaTypeException(
        'Only base64 image data URI payloads are supported',
      );
    }
  }

  public validateUploadedImages(
    images: Array<{ url?: string; publicId?: string }> | undefined,
    limit: number,
  ) {
    if (!images || images.length === 0) {
      return [] as Array<{ url: string; publicId: string }>;
    }

    if (images.length > limit) {
      throw new BadRequestException(`Maximum ${limit} images are allowed`);
    }

    return images.map((item, index) => {
      const url = item?.url?.trim();
      const publicId = item?.publicId?.trim();

      if (!url || !publicId) {
        throw new BadRequestException(
          `photos[${index}] must include url and publicId`,
        );
      }

      this.ensureSecureImageUrl(url);
      return { url, publicId };
    });
  }

  public ensureSecureImageUrl(value: string): void {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:') {
        throw new UnsupportedMediaTypeException(
          'Only HTTPS image urls are supported',
        );
      }
    } catch (_) {
      throw new UnsupportedMediaTypeException('Invalid image URL');
    }
  }

  public parseAiCategoriesFromText(params: {
    text: string;
    catalog: Array<{ id: string; name: string }>;
    fallbackCategory: string;
  }): Array<{ id: string; name: string; confidence: number }> {
    const byId = new Map(
      params.catalog.map((item) => [item.id.trim().toLowerCase(), item]),
    );
    const byName = new Map(
      params.catalog.map((item) => [item.name.trim().toLowerCase(), item]),
    );

    let decoded: unknown;
    try {
      decoded = JSON.parse(params.text);
    } catch (_) {
      const start = params.text.indexOf('{');
      const end = params.text.lastIndexOf('}');
      if (start < 0 || end <= start) {
        return [];
      }
      try {
        decoded = JSON.parse(params.text.slice(start, end + 1));
      } catch (_) {
        return [];
      }
    }

    if (!decoded || typeof decoded !== 'object') {
      return [];
    }
    const rawCategories = (decoded as Record<string, unknown>).categorias;
    if (!Array.isArray(rawCategories)) {
      return [];
    }

    const output: Array<{ id: string; name: string; confidence: number }> = [];
    const seen = new Set<string>();
    for (const item of rawCategories) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const row = item as Record<string, unknown>;
      const rawId = String(row.id ?? '')
        .trim()
        .toLowerCase();
      const rawName = String(row.nombre ?? row.name ?? '').trim();

      const resolved =
        (rawId ? byId.get(rawId) : undefined) ??
        (rawName ? byName.get(rawName.toLowerCase()) : undefined) ??
        (rawName
          ? params.catalog.find((category) =>
              category.name.toLowerCase().includes(rawName.toLowerCase()),
            )
          : undefined);

      if (!resolved || seen.has(resolved.id)) {
        continue;
      }
      seen.add(resolved.id);

      const confidenceRaw = Number(row.confianza ?? row.confidence ?? 0.5);
      output.push({
        id: resolved.id,
        name: resolved.name,
        confidence: Number.isFinite(confidenceRaw)
          ? Math.max(0, Math.min(1, confidenceRaw))
          : 0.5,
      });
    }

    output.sort((a, b) => b.confidence - a.confidence);
    return output;
  }
}
