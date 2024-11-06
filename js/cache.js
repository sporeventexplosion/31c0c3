import { h, render } from "https://esm.sh/preact@10.24.3";
import { useState } from "https://esm.sh/preact@10.24.3/hooks";

const H = (t, ...c) => h(t, null, ...c);

const rangeMap = (n, f) => {
  const ret = [];
  for (let i = 0; i < n; i++) {
    ret.push(f(i));
  }
  return ret;
};

const createRandomCache = (nWays) => ({
  lfsr: 1,
  nWays,
  ways: rangeMap(nWays, (i) => ({
    tag: -1,
  })),
  maxTag: -1,
});

const randomCacheReplace = (old) => {
  const nWays = old.nWays;
  const toReplace = randomCacheWayToReplace(old);
  const nextTag = old.maxTag + 1;
  return {
    lfsr: lfsr16Next(old.lfsr),
    nWays,
    ways: old.ways.map((w, i) => {
      if (i != toReplace) {
        return w;
      } else {
        return {
          tag: nextTag,
        };
      }
    }),
    maxTag: nextTag,
  };
};

const randomCacheWayToReplace = (cache) =>
  extractRandom(cache.nWays, cache.lfsr);

const PRandomCache = (props) => {
  const [cache, setCache] = useState(() => createRandomCache(props.nWays));
  if (props.nWays !== cache.nWays) {
    setCache(createRandomCache(props.nWays));
  }
  const nextToReplace = randomCacheWayToReplace(cache);

  return H(
    "div",
    H("h2", "Random replacement policy"),
    H(
      "div",
      "16-bit linear-feedback shift register (Fibonacci): ",
      stringChunks(4, "_", cache.lfsr.toString(2).padStart(16, "0")),
    ),
    H("div", "Next way to replace: ", String(nextToReplace)),
    H(
      "table",
      H(
        "tr",
        H("td", "Way"),
        rangeMap(cache.nWays, (i) =>
          h(
            "td",
            {
              key: i,
              style: { backgroundColor: i === nextToReplace ? "#fc0" : "" },
            },
            String(i),
          ),
        ),
      ),
      H(
        "tr",
        H("td", "Tag"),
        cache.ways.map((w, i) =>
          h("td", { key: i }, w.tag >= 0 ? String(w.tag) : ""),
        ),
      ),
    ),
    h(
      "button",
      { onClick: () => setCache(createRandomCache(props.nWays)) },
      "Reset",
    ),
    h(
      "button",
      { onClick: () => setCache(randomCacheReplace(cache)) },
      "Insert/Replace",
    ),
    H("p", "This policy does not update its state on a cache hit"),
    H(
      "p",
      "The real implementation in Rocket Chip uses a shared LFSR for all sets",
    ),
    H(
      "p",
      'To obtain the way to replace, the low bits of the LFSR are used if the number of ways is a power of 2. Otherwise a "partition" function is used to sample from a roughly uniform distribution (see ',
      h(
        "a",
        {
          href: "https://github.com/chipsalliance/rocket-chip/blob/1b9f43352c7fd6e4e81cb244b422f6c605ffd3df/src/main/scala/util/Misc.scala#L155",
        },
        "this Chisel source",
      ),
      ")",
    ),
  );
};

const stringChunks = (l, sep, s) => {
  let ret = "";
  for (let i = 0; i < s.length; i += l) {
    if (i > 0) {
      ret += sep;
    }
    ret += s.slice(i, i + l);
  }
  return ret;
};

const lfsr16Next = (n) =>
  ((((n << 15) ^ (n << 13) ^ (n << 12) ^ (n << 10)) & 0x8000) | (n >> 1)) &
  0xffff;

const extractRandom = (n, r) => {
  if ((n & (n - 1)) === 0) {
    return (n - 1) & r;
  } else {
    // take the bottom (log2up(n) + 3) bits
    let mask = n << 3;
    mask |= mask >>> 1;
    mask |= mask >>> 2;
    mask |= mask >>> 4;
    mask |= mask >>> 8;
    mask |= mask >>> 16;
    const v = r & mask;
    const d = mask + 1;
    for (let i = 0; ; i++) {
      const bound = Math.floor(((i + 1) * d) / n);
      if (v < bound) {
        return i;
      }
    }
  }
};

// const PLFSR16 = (props) => {
//   const [value, setValue] = useState(1);
//   return H('div', stringChunks(4, '_', value.toString(2).padStart(16, '0')), h('button', { onClick: () => setValue(lfsr16Next(value)) }, 'Update'));
// };

const filled = (n, v) => {
  const ret = [];
  for (let i = 0; i < n; i++) {
    ret.push(v);
  }
  return ret;
};

const createTrueLruCache = (nWays) => ({
  nWays,
  ways: rangeMap(nWays, (i) => ({
    moreRecentThan: filled(nWays - i - 1, false),
    tag: -1,
  })),
  maxTag: -1,
});

const trueLruCacheAccessWay = (old, i, replace) => {
  if (old.ways[i].tag < 0) {
    replace = true;
  }

  const nWays = old.nWays;
  const nextTag = old.maxTag + 1;
  return {
    nWays,
    ways: old.ways.map((w, j) => ({
      moreRecentThan:
        i === j
          ? filled(nWays - i - 1, true)
          : i < j
            ? w.moreRecentThan
            : w.moreRecentThan.map((v, k) => (k + j + 1 === i ? false : v)),
      tag: i === j && replace ? nextTag : w.tag,
    })),
    maxTag: replace ? nextTag : old.maxTag,
  };
};

const trueLruCacheWayToReplace = (cache) => {
  for (let i = 0; i < cache.ways.length; i++) {
    const way = cache.ways[i];
    if (way.moreRecentThan.every((x) => !x)) {
      return i;
    }
  }
};

const PTrueLruCache = (props) => {
  const [cache, setCache] = useState(() => createTrueLruCache(props.nWays));
  if (props.nWays !== cache.nWays) {
    setCache(createTrueLruCache(props.nWays));
  }
  const nextToReplace = trueLruCacheWayToReplace(cache);

  return H(
    "div",
    H("h2", "True LRU replacement policy"),
    H("div", "Next way to replace: ", String(nextToReplace)),
    H(
      "table",
      H(
        "tr",
        H("td", "Way"),
        rangeMap(cache.nWays, (i) =>
          h(
            "td",
            {
              key: i,
              style: { backgroundColor: i === nextToReplace ? "#fc0" : "" },
            },
            String(i),
          ),
        ),
      ),
      rangeMap(cache.nWays - 1, (i) =>
        h(
          "tr",
          { key: i },
          H("td", `More recent than ${i + 1}?`),
          rangeMap(i + 1, (j) =>
            h(
              "td",
              { key: j, style: { backgroundColor: "#eee" } },
              String(cache.ways[j].moreRecentThan[i - j]),
            ),
          ),
        ),
      ),
      H(
        "tr",
        H("td", "Tag"),
        cache.ways.map((w, i) =>
          h("td", { key: i }, w.tag >= 0 ? String(w.tag) : ""),
        ),
      ),
      H(
        "tr",
        H("td", "Access way"),
        cache.ways.map((w, i) =>
          h(
            "td",
            { key: i },
            h(
              "button",
              {
                onClick: () => setCache(trueLruCacheAccessWay(cache, i, false)),
              },
              "Access",
            ),
          ),
        ),
      ),
    ),
    h(
      "button",
      { onClick: () => setCache(createTrueLruCache(props.nWays)) },
      "Reset",
    ),
    h(
      "button",
      {
        onClick: () =>
          setCache(trueLruCacheAccessWay(cache, nextToReplace, true)),
      },
      "Insert/Replace",
    ),
  );
};

const treePseudoLruCacheGetLevels = (n) => {
  if ((n & (n - 1)) !== 0) {
    n |= n >> 1;
    n |= n >> 2;
    n |= n >> 4;
    n |= n >> 8;
    n |= n >> 16;
    n += 1;
  }
  return Math.log2(n);
};

const createTreePseudoLruCache = (nWays) => {
  const nLevels = treePseudoLruCacheGetLevels(nWays);
  const levelLengths = rangeMap(
    nLevels,
    (i) => (nWays + (1 << i) - 1) >> (i + 1),
  );
  const levelOffsets = [];
  let o = 0;
  for (const w of levelLengths) {
    levelOffsets.push(o);
    o += w;
  }
  return {
    nWays,
    nLevels: treePseudoLruCacheGetLevels(nWays),
    levelLengths,
    levelOffsets,
    state: filled(nWays - 1, false),
    ways: rangeMap(nWays, (_i) => ({
      tag: -1,
    })),
    maxTag: -1,
  };
};

const treePseudoLruCacheWayToReplace = (cache) => {
  let ret = 0;
  for (let level = cache.nLevels - 1; level >= 0; level--) {
    let next = ret << 1;
    const levelExists = ret < cache.levelLengths[level];
    if (levelExists && !cache.state[cache.levelOffsets[level] + ret]) {
      next |= 1;
    }
    ret = next;
  }
  return ret;
};

const treePseudoLruCacheAccessWay = (old, i, replace) => {
  if (old.ways[i].tag < 0) {
    replace = true;
  }

  const nextState = old.state.slice();
  const nLevels = old.nLevels;
  const levelLengths = old.levelLengths;
  const levelOffsets = old.levelOffsets;
  for (let level = nLevels - 1; level >= 0; level--) {
    let idx = i >> (level + 1);
    const levelExists = idx < levelLengths[level];
    if (levelExists) {
      nextState[levelOffsets[level] + idx] = ((i >> level) & 1) !== 0;
    }
  }

  const nWays = old.nWays;
  const nextTag = old.maxTag + 1;
  return {
    nWays,
    nLevels,
    levelLengths,
    levelOffsets,
    state: nextState,
    ways: replace
      ? old.ways.map((w, j) =>
          j == i
            ? {
                tag: nextTag,
              }
            : w,
        )
      : old.ways,
    maxTag: replace ? nextTag : old.maxTag,
  };
};

const PTreePseudoLruCache = (props) => {
  const [cache, setCache] = useState(() =>
    createTreePseudoLruCache(props.nWays),
  );
  if (props.nWays !== cache.nWays) {
    setCache(createTreePseudoLruCache(props.nWays));
  }
  const nextToReplace = treePseudoLruCacheWayToReplace(cache);

  return H(
    "div",
    H("h2", "Tree pseudo-LRU replacement policy"),
    H("div", "Next way to replace: ", String(nextToReplace)),
    H(
      "table",
      H(
        "tr",
        H("td", "Way"),
        rangeMap(cache.nWays, (i) =>
          h(
            "td",
            {
              key: i,
              style: { backgroundColor: i === nextToReplace ? "#fc0" : "" },
            },
            String(i),
          ),
        ),
      ),
      rangeMap(cache.nLevels, (i) => {
        const level = cache.nLevels - i - 1;
        const width = 1 << (level + 1);
        const minWidth = (1 << level) + 1;
        return h(
          "tr",
          { key: i },
          H("td", `Level ${level}`),
          rangeMap(Math.ceil(cache.nWays / width), (j) => {
            const cs = Math.min(width, cache.nWays - j * width);
            const exists = cs >= minWidth;
            const value = exists
              ? cache.state[cache.levelOffsets[level] + j]
              : "";
            return h(
              "td",
              {
                key: j,
                colspan: cs,
                style: { textAlign: "center", backgroundColor: "#eee" },
              },
              exists ? (value ? "-->" : "<--") : "",
            );
          }),
        );
      }),
      H(
        "tr",
        H("td", "Tag"),
        cache.ways.map((w, i) =>
          h("td", { key: i }, w.tag >= 0 ? String(w.tag) : ""),
        ),
      ),
      H(
        "tr",
        H("td", "Access way"),
        rangeMap(cache.nWays, (i) =>
          h(
            "td",
            { key: i },
            h(
              "button",
              {
                onClick: () =>
                  setCache(treePseudoLruCacheAccessWay(cache, i, false)),
              },
              "Access",
            ),
          ),
        ),
      ),
    ),
    h(
      "button",
      { onClick: () => setCache(createTreePseudoLruCache(props.nWays)) },
      "Reset",
    ),
    h(
      "button",
      {
        onClick: () =>
          setCache(treePseudoLruCacheAccessWay(cache, nextToReplace, true)),
      },
      "Insert/Replace",
    ),
    H(
      "p",
      'In the Chisel source, higher-numbered sets are considered to be to the "left". Here they are to the right',
    ),
  );
};

const App = (props) => {
  const [nWays, setNWays] = useState(8);
  const [isInvalid, setIsInvalid] = useState(false);
  const trySetNWays = (ev) => {
    const text = ev.target.value;
    const n = parseInt(text, 10);
    const isInvalid = !(n >= 2 && n <= 32);
    setIsInvalid(isInvalid);
    if (!isInvalid) setNWays(n);
  };
  return H(
    "div",
    H(
      "div",
      "Set number of ways (2-32): ",
      h("input", { value: nWays, onChange: trySetNWays }),
      isInvalid ? " Invalid value" : "",
    ),
    PRandomCache({ nWays }),
    PTrueLruCache({ nWays }),
    PTreePseudoLruCache({ nWays }),
  );
};

const c = document.getElementById("demo");
c.textContent = "";
render(H(App), c);
