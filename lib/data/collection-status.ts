type CollectionInput = {
  hasData: boolean;
  fetchedAt?: string;
  pending?: boolean;
  startedAt?: string;
  failed?: boolean;
  partial?: boolean;
  connected?: boolean;
  staleAfterDays?: number;
};

export type CollectionStatus = {
  label: string;
  detail: string;
  warning: boolean;
};

/** Authentication, successful data retrieval and fresh data are separate facts. */
export function collectionStatus(
  input: CollectionInput,
  now: number,
): CollectionStatus {
  const previous = input.hasData
    ? ' 기존에 가져온 정보는 계속 볼 수 있어요.'
    : '';
  // 이미 가져온 정보가 신선도 기준 안쪽이면 실패 배지로 가리지 않는다 —
  // 마지막 시도만 실패한 것이지 화면의 데이터가 오래된 것은 아니다.
  const fetched = Date.parse(input.fetchedAt ?? '');
  const freshData =
    input.hasData &&
    Number.isFinite(fetched) &&
    fetched <= now &&
    now - fetched < (input.staleAfterDays ?? 1) * 86400000;
  if (input.failed && !freshData)
    return {
      label: '최근 수집 실패',
      detail: `마지막 요청에서 정보를 확인하지 못했어요.${previous}`,
      warning: true,
    };
  if (input.pending) {
    const started = Date.parse(input.startedAt ?? '');
    const delayed =
      !Number.isFinite(started) || started > now || now - started >= 120000;
    return delayed
      ? {
          label: '수집 상태 확인 필요',
          detail: `수집이 끝났는지 아직 확인하지 못했어요.${previous}`,
          warning: true,
        }
      : {
          label: '수집 중',
          detail: `학교에서 정보를 가져오고 있어요.${previous}`,
          warning: false,
        };
  }
  if (!input.hasData)
    return {
      label: input.connected ? '가져온 정보 없음' : '미연결',
      detail: input.connected
        ? '계정 인증과 정보 수집은 별개예요. 아직 표시할 수집본이 없어요.'
        : '아직 이 서비스에서 확인한 정보가 없어요.',
      warning: true,
    };
  if (input.partial)
    return {
      label: '일부 항목 확인 필요',
      detail:
        '확인하지 못한 항목이나 이전 결과가 포함돼 있어요. 항목별 상태를 확인해 주세요.',
      warning: true,
    };
  if (!Number.isFinite(fetched) || fetched > now)
    return {
      label: '수집 시각 확인 필요',
      detail: '가져온 정보의 마지막 확인 시각을 알 수 없어요.',
      warning: true,
    };
  if (now - fetched >= (input.staleAfterDays ?? 1) * 86400000)
    return {
      label: '현재 정보 재확인 필요',
      detail:
        '수집된 지 시간이 지났어요. 학교에서 변경된 내용이 있을 수 있어요.',
      warning: true,
    };
  return {
    label: '수집본 있음',
    detail: '마지막 수집 시점의 정보예요. 이후 변경은 다시 가져와야 반영돼요.',
    warning: false,
  };
}
