"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicMapConfig } from "@/server/config";

export interface MapStore {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  revenge: boolean;
}

export function ArcadeMap({
  stores,
  map,
}: {
  stores: MapStore[];
  map: PublicMapConfig;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(map.message);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const markerKey = stores
    .map((store) => `${store.id}:${store.latitude ?? ""}:${store.longitude ?? ""}:${store.revenge}`)
    .join("|");

  useEffect(() => {
    const element = mapRef.current;
    const markedStores = stores.filter((store) => store.latitude !== null && store.longitude !== null);
    if (!element || map.provider === "none" || !map.clientId || (markedStores.length === 0 && !location)) {
      return;
    }
    let cancelled = false;
    const script = document.createElement("script");
    script.async = true;
    if (map.provider === "naver") {
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(map.clientId)}`;
    } else {
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(map.clientId)}&autoload=false`;
    }
    script.onerror = () => {
      if (!cancelled) {
        setStatus("지도 스크립트를 불러오지 못했습니다. 아래 목록으로 매장을 선택할 수 있습니다.");
      }
    };
    script.onload = () => {
      if (cancelled) {
        return;
      }
      const center = location ?? {
        latitude: markedStores[0]?.latitude ?? 37.5665,
        longitude: markedStores[0]?.longitude ?? 126.978,
      };
      const maps = window as unknown as {
        naver?: {
          maps: {
            Map: new (node: HTMLElement, options: object) => object;
            LatLng: new (lat: number, lng: number) => object;
            Marker: new (options: object) => object;
          };
        };
        kakao?: { maps: { load: (callback: () => void) => void; Map: new (node: HTMLElement, options: object) => object; LatLng: new (lat: number, lng: number) => object; Marker: new (options: object) => { setMap: (map: object) => void } } };
      };
      if (map.provider === "naver" && maps.naver) {
        const naverMap = new maps.naver.maps.Map(element, {
          center: new maps.naver.maps.LatLng(center.latitude, center.longitude),
          zoom: 14,
        });
        for (const store of markedStores) {
          if (store.latitude === null || store.longitude === null) {
            continue;
          }
          new maps.naver.maps.Marker({
            position: new maps.naver.maps.LatLng(store.latitude, store.longitude),
            map: naverMap,
            title: store.revenge ? `복수 · ${store.name}` : store.name,
          });
        }
        setStatus(null);
        return;
      }
      maps.kakao?.maps.load(() => {
        if (!maps.kakao || cancelled) {
          return;
        }
        const kakaoMap = new maps.kakao.maps.Map(element, {
          center: new maps.kakao.maps.LatLng(center.latitude, center.longitude),
          level: 5,
        });
        for (const store of markedStores) {
          if (store.latitude === null || store.longitude === null) {
            continue;
          }
          const marker = new maps.kakao.maps.Marker({
            position: new maps.kakao.maps.LatLng(store.latitude, store.longitude),
            title: store.name,
          });
          marker.setMap(kakaoMap);
        }
        setStatus(null);
      });
    };
    document.head.appendChild(script);
    return () => {
      cancelled = true;
      script.remove();
    };
  }, [location, map.clientId, map.provider, markerKey, stores]);

  function requestLocation() {
    if (!navigator.geolocation) {
      setStatus("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => setStatus("위치 권한을 허용하지 않았거나 시간을 초과했습니다. 위치는 계속 추적하지 않습니다."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  return (
    <section className="pixel-border rounded-3xl bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">오락실 지도</h2>
        <button type="button" onClick={requestLocation} className="min-h-11 rounded-full bg-lavender px-3 text-sm">
          내 위치
        </button>
      </div>
      {map.provider === "none" ? (
        <div className="rounded-2xl bg-cream-deep px-3 py-4 text-sm leading-6">
          {map.message}
        </div>
      ) : (
        <div ref={mapRef} className="h-64 w-full rounded-2xl bg-grass-soft" />
      )}
      {status ? <p className="mt-2 text-sm text-ink/75">{status}</p> : null}
      <ul className="mt-3 space-y-2">
        {stores.length === 0 ? <li className="text-sm text-ink/70">등록된 매장이 없습니다.</li> : null}
        {stores.map((store) => (
          <li key={store.id}>
            <a href={`/stores/${store.id}`} className="block min-h-11 rounded-2xl bg-cream px-3 py-2">
              <span className="font-medium">{store.name}</span>
              <span className="mt-1 block text-sm text-ink/70">
                {store.address || "주소 없음"}
                {store.latitude === null ? " · 지도 마커 없음" : ""}
                {store.revenge ? " · 복수 대기" : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
