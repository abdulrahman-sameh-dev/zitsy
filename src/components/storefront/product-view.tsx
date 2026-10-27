"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  CONSENT_CHANGED_EVENT,
  hasAnalyticsConsent,
  trackEvent,
} from "@/lib/analytics/client";
import { ecommerceParams, viewItemParams } from "@/lib/analytics/events";
import type { AnalyticsLineInput } from "@/lib/analytics/events";
import { addToCart } from "@/lib/cart/actions";
import { deriveCategoryForProduct } from "@/lib/catalog/categories";
import {
  availableValueIdsForDim,
  hasDistinctPrices,
  minPriceMinor,
  orderableVariants,
  resolveVariant,
} from "@/lib/catalog/variants";
import type { ProductViewRecord } from "@/lib/catalog/view";
import { imagesForVariant } from "@/lib/catalog/view";
import {
  buildColorGallery,
  distinctAngles,
  suggestCompatibleSize,
  swatchColor,
} from "@/lib/catalog/gallery";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Props {
  product: ProductViewRecord;
}

const GALLERY_CAP = 12;
const MAX_ZOOM = 2.2;

export function ProductView({ product }: Props) {
  const [selection, setSelection] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const dim of product.dims) {
      if (dim.values.length === 1) initial[dim.name] = dim.values[0].valueId;
    }
    // Pre-select the first colour so the gallery opens scoped to one colour
    // instead of dumping every mockup. The customer is free to change it.
    const colorDim = product.dims.find((dim) => dim.type === "color");
    if (colorDim && initial[colorDim.name] == null && colorDim.values.length > 0) {
      initial[colorDim.name] = colorDim.values[0].valueId;
    }
    return initial;
  });
  const [galleryState, setGalleryState] = useState<{
    key: unknown;
    index: number;
  }>({ key: null, index: 0 });
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [zoom, setZoom] = useState<{ x: number; y: number; on: boolean }>({
    x: 50,
    y: 50,
    on: false,
  });
  const [canHoverZoom, setCanHoverZoom] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = (matches: boolean) => setCanHoverZoom(matches);
    apply(mq.matches);
    mq.addEventListener("change", (event) => apply(event.matches));
    return () => mq.removeEventListener("change", (event) => apply(event.matches));
  }, []);

  const orderable = useMemo(
    () => orderableVariants(product.variants),
    [product.variants],
  );
  const dimNames = useMemo(() => product.dims.map((dim) => dim.name), [product.dims]);
  const resolved = useMemo(
    () => resolveVariant(product.variants, selection, dimNames),
    [product.variants, selection, dimNames],
  );
  const incompleteDims = useMemo(
    () =>
      product.dims
        .filter((dim) => selection[dim.name] == null)
        .map((dim) => dim.name),
    [product.dims, selection],
  );

  const gallery = useMemo(
    () => buildColorGallery(product.dims, product.variants, product.images),
    [product.dims, product.variants, product.images],
  );
  const colorDim = gallery.colorDimName !== "" ? gallery.colorDimName : null;
  const activeGroup = useMemo(() => {
    if (gallery.groups.length === 0) return null;
    const selected = colorDim ? selection[colorDim] : undefined;
    return (
      gallery.groups.find((group) => group.valueId === selected) ??
      gallery.groups[0] ??
      null
    );
  }, [gallery.groups, colorDim, selection]);

  const galleryImages = useMemo(() => {
    if (activeGroup) return distinctAngles(activeGroup.images, GALLERY_CAP);
    const base = imagesForVariant(product.images, resolved?.printifyVariantId ?? null);
    return distinctAngles(base, 8);
  }, [activeGroup, product.images, resolved]);

  // Reset the gallery to the first image when the image set changes (colour
  // switch, variant select) — adjusting state during render, no effect.
  if (galleryState.key !== galleryImages) {
    setGalleryState({ key: galleryImages, index: 0 });
  }
  const galleryIndex =
    galleryState.key === galleryImages ? galleryState.index : 0;
  const setGalleryIndex = (index: number) =>
    setGalleryState({ key: galleryImages, index });

  const productUnavailable = orderable.length === 0;
  const selectedUnavailable =
    resolved !== null && !(resolved.isEnabled && resolved.isAvailable);

  const price = useMemo(() => {
    if (resolved) {
      return formatMoney(resolved.priceMinor, product.currency);
    }
    // Nothing sellable: never advertise £0.00 as a product price.
    if (productUnavailable) return null;
    const base = minPriceMinor(product.variants);
    const formatted = formatMoney(base, product.currency);
    return hasDistinctPrices(product.variants) ? `From ${formatted}` : formatted;
  }, [product.variants, product.currency, resolved, productUnavailable]);

  const askFor = incompleteDims.length > 0 ? incompleteDims.join(" and ") : null;

  const selectColor = useCallback(
    (valueId: number) => {
      setSelection((current) => {
        const next = { ...current };
        if (!colorDim || current[colorDim] === valueId) {
          if (colorDim) delete next[colorDim];
          return next;
        }
        next[colorDim] = valueId;
        // Never silently keep a size the new colour is not made in.
        const sizeDim = product.dims.find((dim) => dim.type === "size");
        if (sizeDim && current[sizeDim.name] != null) {
          const fix = suggestCompatibleSize(
            valueId,
            current[sizeDim.name],
            sizeDim,
            product.variants,
          );
          if (fix !== null && fix !== current[sizeDim.name]) {
            next[sizeDim.name] = fix;
          }
        }
        return next;
      });
      setNote(null);
    },
    [colorDim, product.dims, product.variants],
  );

  const toggleValue = useCallback(
    (dimName: string, valueId: number) => {
      setSelection((current) => {
        if (current[dimName] === valueId) {
          const next = { ...current };
          delete next[dimName];
          return next;
        }
        return { ...current, [dimName]: valueId };
      });
      setNote(null);
    },
    [],
  );

  const canAdd = resolved !== null && !productUnavailable && !selectedUnavailable;
  const trackedProductView = useRef(false);
  const analyticsLine = useMemo<AnalyticsLineInput>(
    () => ({
      productId: product.id,
      variantId: resolved?.id ?? `product:${product.id}`,
      productTitle: product.title,
      variantTitle: resolved?.title ?? "Default",
      unitPriceMinor: resolved?.priceMinor ?? product.minPriceMinor,
      quantity: 1,
      currency: product.currency,
      category: deriveCategoryForProduct(product.tags).name,
    }),
    [product, resolved],
  );

  useEffect(() => {
    const send = () => {
      if (trackedProductView.current || !hasAnalyticsConsent()) return;
      trackedProductView.current = true;
      trackEvent("view_item", viewItemParams(analyticsLine));
    };
    send();
    window.addEventListener(CONSENT_CHANGED_EVENT, send);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, send);
  }, [analyticsLine]);

  const handleAdd = () => {
    if (!canAdd || !resolved) return;
    const variantId = resolved.id;
    startTransition(async () => {
      const result = await addToCart({
        productId: product.id,
        variantId,
        quantity,
      });
      if (result.ok) {
        trackEvent(
          "add_to_cart",
          ecommerceParams([{ ...analyticsLine, quantity }]),
        );
      }
      setNote(
        result.ok
          ? { ok: true, text: "Added to your cart." }
          : { ok: false, text: result.error },
      );
    });
  };

  const currentImage = galleryImages[Math.min(galleryIndex, galleryImages.length - 1)];
  const currentImageKey = currentImage?.src ?? null;
  const imageAlt = (index: number) =>
    resolved
      ? `${product.title} in ${resolved.title} — image ${index + 1} of ${galleryImages.length}`
      : `${product.title} — image ${index + 1} of ${galleryImages.length}`;

  const zoomActive = canHoverZoom && zoom.on && currentImageKey !== null;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Gallery */}
      <div className="space-y-3">
        <div
          className={cn(
            "group relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-brand-50",
            canHoverZoom && "cursor-zoom-in",
          )}
          onMouseMove={(event) => {
            if (!canHoverZoom) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setZoom({
              x: ((event.clientX - rect.left) / rect.width) * 100,
              y: ((event.clientY - rect.top) / rect.height) * 100,
              on: true,
            });
          }}
          onMouseLeave={() => setZoom((z) => ({ ...z, on: false }))}
        >
          {currentImage ? (
            <>
              <Image
                src={currentImage.src}
                alt={imageAlt(Math.min(galleryIndex, galleryImages.length - 1))}
                fill
                priority={galleryIndex === 0}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-contain transition-transform duration-150 ease-out"
                style={
                  zoomActive
                    ? {
                        transform: `scale(${MAX_ZOOM})`,
                        transformOrigin: `${zoom.x}% ${zoom.y}%`,
                      }
                    : undefined
                }
              />
              {canHoverZoom ? (
                <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-white">
                  Hover to zoom
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setLightboxZoom(false);
                  dialogRef.current?.showModal();
                }}
                aria-label="View image larger"
                className="absolute bottom-3 right-3 rounded-md border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-canvas"
              >
                Expand
              </button>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No image
            </div>
          )}
        </div>

        {/* Colour selector — one representative thumb per available colour. */}
        {gallery.groups.length > 1 ? (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{gallery.colorDimName}</span>
              <span className="truncate text-sm text-muted" aria-live="polite">
                {activeGroup?.title}
              </span>
            </div>
            <div
              className="mt-2 flex flex-wrap items-center gap-2"
              role="listbox"
              aria-label={gallery.colorDimName}
            >
              {gallery.groups.map((group) => {
                const selected = selection[gallery.colorDimName] === group.valueId;
                return (
                  <button
                    key={group.valueId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={group.title}
                    aria-label={group.title}
                    onClick={() => selectColor(group.valueId)}
                    className={cn(
                      "relative h-12 w-12 overflow-hidden rounded-lg border bg-brand-50 transition-colors",
                      selected
                        ? "border-brand-700 ring-2 ring-brand-700/40"
                        : "border-line hover:border-brand-500",
                    )}
                  >
                    {group.heroImage ? (
                      <Image
                        src={group.heroImage.src}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-contain"
                      />
                    ) : (
                      <span
                        className="block h-full w-full"
                        style={{
                          backgroundColor: swatchColor(group.title) ?? "#d3d1ca",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {galleryImages.length > 1 ? (
          <div
            className="grid grid-cols-6 gap-2"
            role="list"
            aria-label="Product images"
          >
            {galleryImages.map((image, index) => (
              <button
                key={image.src}
                type="button"
                role="listitem"
                onClick={() => setGalleryIndex(index)}
                aria-label={`Show ${imageAlt(index)}`}
                aria-current={index === galleryIndex}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-md border bg-brand-50",
                  index === galleryIndex
                    ? "border-brand-700 ring-2 ring-brand-700/30"
                    : "border-line hover:border-brand-500",
                )}
              >
                <Image
                  src={image.src}
                  alt=""
                  fill
                  sizes="16vw"
                  className="object-contain"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Buy box */}
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {product.title}
        </h1>

        <p className="text-xl font-semibold text-brand-700" aria-live="polite">
          {price}
        </p>

        {productUnavailable ? (
          <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            This product is currently unavailable.
          </p>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
          className="flex flex-col gap-5"
        >
          {/* Non-colour dimensions are chosen here; colour is chosen in the gallery. */}
          {product.dims
            .filter((dim) => dim.name !== colorDim)
            .map((dim) => {
              const available = availableValueIdsForDim(
                dim.name,
                dim.values.map((value) => value.valueId),
                selection,
                product.variants,
              );
              return (
                <fieldset key={dim.name}>
                  <legend className="mb-2 text-sm font-semibold text-ink">
                    {dim.name}
                  </legend>
                  <div className="flex flex-wrap gap-2" role="group">
                    {dim.values.map((value) => {
                      const selected = selection[dim.name] === value.valueId;
                      const disabled = !available.has(value.valueId);
                      return (
                        <button
                          key={value.valueId}
                          type="button"
                          aria-pressed={selected}
                          disabled={disabled}
                          onClick={() => toggleValue(dim.name, value.valueId)}
                          title={
                            disabled
                              ? "Not available in this combination"
                              : undefined
                          }
                          className={cn(
                            "rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                            selected
                              ? "border-brand-700 bg-brand-700 text-white"
                              : "border-line bg-surface text-ink hover:border-brand-500",
                            disabled &&
                              "cursor-not-allowed opacity-40 hover:border-line",
                          )}
                        >
                          {value.title}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

          {selectedUnavailable && !productUnavailable ? (
            <p className="text-sm font-medium text-zinc-600">
              This combination is currently unavailable.
            </p>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <label htmlFor="quantity" className="text-sm font-semibold text-ink">
              Quantity
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="h-10 w-10 rounded-md border border-line text-lg text-ink transition-colors hover:border-brand-500 disabled:opacity-40"
                disabled={quantity <= 1}
              >
                −
              </button>
              <input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  setQuantity(Number.isNaN(next) || next < 1 ? 1 : next);
                }}
                className="h-10 w-20 rounded-md border border-line text-center text-sm font-medium text-ink focus:outline-brand-700"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="h-10 w-10 rounded-md border border-line text-lg text-ink transition-colors hover:border-brand-500"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canAdd || pending}
            className={cn(
              "w-full rounded-md px-5 py-3 text-sm font-semibold text-white transition-colors",
              canAdd && !pending
                ? "bg-brand-700 hover:bg-brand-800"
                : "cursor-not-allowed bg-zinc-300 text-zinc-500",
            )}
          >
            {pending ? "Adding…" : "Add to cart"}
          </button>

          {!canAdd && askFor ? (
            <p className="text-sm text-muted">
              Select {askFor} to see the exact price and add to cart.
            </p>
          ) : null}
          {note ? (
            <div role="status" aria-live="polite" className="text-sm">
              <p className="font-medium text-brand-700">{note.text}</p>
              {note.ok ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/cart"
                    className="inline-flex items-center justify-center rounded-md bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
                  >
                    View cart
                  </Link>
                  <Link
                    href="/shop"
                    className="inline-flex items-center justify-center rounded-md border border-line-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800"
                  >
                    Continue shopping
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>

        <div className="space-y-3 border-t border-line pt-5 text-sm">
          <p className="leading-relaxed text-muted">
            Made to order — produced only after you order, then packed and
            shipped to you. This is a pre-designed style: choose your colour and
            size, there is no custom upload.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            <li>
              <Link
                href="/shipping"
                className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
              >
                Shipping &amp; delivery
              </Link>
            </li>
            <li>
              <Link
                href="/returns"
                className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
              >
                Returns &amp; refunds
              </Link>
            </li>
            <li>
              <Link
                href="/sizing"
                className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
              >
                Sizing guide
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-label="Expanded product image"
        className="m-auto rounded-xl border border-line bg-surface p-2 shadow-2xl"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        onClose={() => setLightboxZoom(false)}
      >
        {currentImageKey ? (
          <div className="w-[min(88vw,920px)]">
            <div className="flex items-center justify-end gap-2 pb-2">
              <button
                type="button"
                onClick={() => setLightboxZoom((z) => !z)}
                className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas"
              >
                {lightboxZoom ? "Fit to screen" : "Zoom to 1:1"}
              </button>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Close expanded image"
                autoFocus
                className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas"
              >
                Close
              </button>
            </div>
            <div
              className={cn(
                "relative bg-canvas",
                lightboxZoom
                  ? "max-h-[75vh] overflow-auto"
                  : "max-h-[80vh]",
              )}
            >
              <Image
                src={currentImageKey}
                alt={resolved ? `${product.title} in ${resolved.title}` : product.title}
                width={1000}
                height={1000}
                className={cn(
                  "object-contain",
                  lightboxZoom
                    ? "h-auto w-auto max-w-none scale-150 origin-top-left"
                    : "h-auto w-full rounded-lg",
                )}
              />
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}