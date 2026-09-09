/** Offsets are UTF-16 code units, end-exclusive, in the supplied crawl result. */
export type ProfileEvidence = Readonly<{
  pageIndex: number;
  pageUrl: string;
  contentField: "markdown";
  start: number;
  end: number;
  quote: string;
}>;

export type SupportedProfileValue = Readonly<{
  value: string;
  evidence: readonly [ProfileEvidence, ...ProfileEvidence[]];
}>;

/** Confirmed means explicitly claimed by the source, not independently verified. */
export type ProfileField =
  | Readonly<{ status: "unknown"; reason: "no_supported_statement" }>
  | Readonly<{
      status: "confirmed";
      values: readonly [SupportedProfileValue, ...SupportedProfileValue[]];
    }>
  | Readonly<{
      status: "conflicting";
      values: readonly [
        SupportedProfileValue,
        SupportedProfileValue,
        ...SupportedProfileValue[],
      ];
    }>;

export type CompanyProfile = Readonly<{
  methodVersion: "company-profile-v2";
  fields: Readonly<{
    companyName: ProfileField;
    productName: ProfileField;
    shortDescription: ProfileField;
    primaryProduct: ProfileField;
    targetAudience: ProfileField;
    industry: ProfileField;
    keyUseCases: ProfileField;
    capabilities: ProfileField;
    geography: ProfileField;
  }>;
  excludedPages: readonly Readonly<{
    pageIndex: number;
    reason: "http_error" | "unsupported_markup";
  }>[];
}>;
