"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { VillageView } from "@/server/engine/queries";
import { VILLAGE_COLS, VILLAGE_ROWS, tileKey } from "@/domain/village";
import { VillageSimulation } from "@/domain/village-sim";

export function VillageCanvas({
  village,
  compact = false,
}: {
  village: VillageView;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const characterKey = village.characters.map((character) => character.prizeId).join(",");
  const blockedKey = village.blocked.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const blocked = new Set(village.blocked);
    const simulation = new VillageSimulation(
      village.characters.map((character) => ({
        id: character.id,
        prizeId: character.prizeId,
        ownerMemberId: character.ownerMemberId,
        name: character.name,
        col: character.col,
        row: character.row,
      })),
      { blocked },
    );
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let frame = 0;
    let last = performance.now();
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    observer.observe(canvas);

    const paint = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = Math.round((width * VILLAGE_ROWS) / VILLAGE_COLS);
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = false;
      const tile = width / VILLAGE_COLS;
      for (let row = 0; row < VILLAGE_ROWS; row += 1) {
        for (let col = 0; col < VILLAGE_COLS; col += 1) {
          context.fillStyle = (col + row) % 2 === 0 ? "#d7ebc8" : "#c5e0b4";
          context.fillRect(col * tile, row * tile, tile + 0.5, tile + 0.5);
          if (blocked.has(tileKey(col, row))) {
            context.fillStyle = village.unlockedLevel >= 4 && col >= 11 ? "#7eb6d6" : "#c9845a";
            context.fillRect(col * tile + 1, row * tile + 1, tile - 2, tile - 2);
          } else if (village.unlockedLevel >= 2 && (col + row) % 7 === 0) {
            context.fillStyle = "#e07a8a";
            context.fillRect(col * tile + tile / 2, row * tile + 4, 3, 3);
          }
        }
      }
      for (const character of simulation.characters) {
        const x = character.col * tile + tile / 2;
        const y = character.row * tile + (character.state === "idle" ? Math.sin(character.bob / 180) * 1.5 : 0);
        context.fillStyle = "#2c2825";
        context.fillRect(x - 5, y - 10, 10, 12);
        context.fillStyle = "#f3c1c8";
        context.fillRect(x - 3, y - 16, 6, 6);
        if (character.state === "sleep") {
          context.fillStyle = "#2c2825";
          context.font = "8px sans-serif";
          context.fillText("z", x + 6, y - 12);
        }
      }
    };

    const loop = (now: number) => {
      if (simulation.disposedFlag) {
        return;
      }
      const delta = Math.min(48, now - last);
      last = now;
      if (!reduced && visible) {
        simulation.step(delta);
      }
      paint();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    const selectAt = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const tile = rect.width / VILLAGE_COLS;
      const col = Math.floor((event.clientX - rect.left) / tile);
      const row = Math.floor((event.clientY - rect.top) / tile);
      const hit = simulation.characters.find((character) => character.col === col && character.row === row);
      setSelected(hit?.prizeId ?? null);
    };
    canvas.addEventListener("pointerdown", selectAt);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", selectAt);
      simulation.dispose();
    };
  }, [blockedKey, characterKey, village.blocked, village.characters, village.unlockedLevel]);

  const selectedCharacter = village.characters.find((character) => character.prizeId === selected);

  return (
    <section className="pixel-border rounded-3xl bg-card p-3">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{compact ? "마을 미리보기" : village.levelName}</h2>
          <p className="text-sm text-ink/70">
            레벨 {village.currentLevel} · 공개 인형 {village.eligibleCount}개
          </p>
        </div>
        {compact ? (
          <Link href="/village" className="rounded-full bg-grass px-3 py-2 text-sm text-white">
            마을 열기
          </Link>
        ) : null}
      </div>
      <canvas ref={canvasRef} className="w-full touch-none rounded-2xl bg-grass-soft" />
      <p className="mt-2 text-xs leading-5 text-ink/70">
        픽셀 사진이 없으면 기본 게임 캐릭터로 움직입니다. 그 그림은 인형 사진이 아닙니다.
      </p>
      {selectedCharacter ? (
        <Link href={`/collection/${selectedCharacter.prizeId}`} className="mt-2 block rounded-2xl bg-lavender px-3 py-3 text-sm">
          {selectedCharacter.name} · {selectedCharacter.ownerNickname || "멤버"}의 인형 보기
        </Link>
      ) : (
        <p className="mt-2 text-sm text-ink/70">캐릭터를 누르면 인형 정보를 엽니다.</p>
      )}
    </section>
  );
}
