\# Component Specifications



\## Status: In Design by @frontend



\### Component Tree



```

App

├─ Layout

│  ├─ Header

│  ├─ Navigation

│  └─ Footer

├─ Pages

│  ├─ Home

│  ├─ Login

│  ├─ Dashboard (Worker)

│  │  ├─ JobBrowser

│  │  ├─ MyApplications

│  │  ├─ MyEarnings

│  │  └─ Profile

│  ├─ Dashboard (Employer)

│  │  ├─ PostJob

│  │  ├─ ViewApplications

│  │  ├─ MyTeam

│  │  └─ Billing

│  └─ Chat



```



\### Components (To be filled by @frontend)



\#### JobCard (Reusable)

```

Props: {

&#x20; job: {id, title, description, budget, timeline}

&#x20; onApply: () => void

&#x20; isLoading?: boolean

}

```



\#### SearchForm

```

Props: {

&#x20; onSearch: (query, filters) => void

}

```



\#### etc...



\---

\*\*Updated by\*\*: @frontend

\*\*Last update\*\*: \[Date]

```



