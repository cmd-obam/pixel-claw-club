export function isProductionConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://"),
  );
}

export type MapProviderName = "naver" | "kakao" | "none";

export interface PublicMapConfig {
  provider: MapProviderName;
  clientId: string | null;
  searchReady: boolean;
  message: string | null;
}

export function publicMapConfig(): PublicMapConfig {
  const provider = process.env.NEXT_PUBLIC_MAP_PROVIDER;
  if (provider === "naver") {
    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? "";
    const searchReady = Boolean(
      process.env.NAVER_SEARCH_CLIENT_ID && process.env.NAVER_SEARCH_CLIENT_SECRET,
    );
    if (!clientId) {
      return {
        provider: "none",
        clientId: null,
        searchReady: false,
        message: "네이버 지도 키가 없습니다. 매장은 목록으로 관리할 수 있습니다.",
      };
    }
    return {
      provider: "naver",
      clientId,
      searchReady,
      message: searchReady ? null : "지도는 표시되지만 장소 검색 API 키가 없어 직접 등록만 가능합니다.",
    };
  }
  if (provider === "kakao") {
    const clientId = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "";
    const searchReady = Boolean(process.env.KAKAO_REST_API_KEY);
    if (!clientId) {
      return {
        provider: "none",
        clientId: null,
        searchReady: false,
        message: "카카오 지도 키가 없습니다. 매장은 목록으로 관리할 수 있습니다.",
      };
    }
    return {
      provider: "kakao",
      clientId,
      searchReady,
      message: searchReady ? null : "지도는 표시되지만 장소 검색 API 키가 없어 직접 등록만 가능합니다.",
    };
  }
  return {
    provider: "none",
    clientId: null,
    searchReady: false,
    message: "지도 공급자가 설정되지 않았습니다. 매장 목록과 수동 등록은 사용할 수 있습니다.",
  };
}
