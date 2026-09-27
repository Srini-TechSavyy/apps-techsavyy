#!/usr/bin/env node
/**
 * Sync app listings from a Notion data source into data/apps.json.
 *
 * Env:
 *   NOTION_TOKEN (required unless --mock)
 *   NOTION_DATA_SOURCE_ID (optional; defaults to Techsavyy apps data source)
 */

const fs = require('fs');
const path = require('path');

const NOTION_VERSION = '2025-09-03';
const DEFAULT_DATA_SOURCE_ID = 'f3f89502-43d1-49d4-9ef6-eb4af133a6c6';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'apps.json');

const MOCK_PAGES = [
  {
    id: 'mock-learn',
    properties: {
      Name: { title: [{ plain_text: 'LearnApp' }] },
      Category: { select: { name: 'Kids' } },
      Status: { status: { name: 'In progress' } },
      Priority: { select: { name: 'High' } },
      Domain: { url: null },
      Notes: {
        rich_text: [
          {
            plain_text:
              'Kids learning app for Grades 3 and 7, with XP, daily challenges, parent-child mapping and redemption.',
          },
        ],
      },
    },
  },
  {
    id: 'mock-wfo',
    properties: {
      Name: { title: [{ plain_text: 'WFO/WFH Tracker' }] },
      Category: { select: { name: 'Utility' } },
      Status: { status: { name: 'Done' } },
      Priority: { select: { name: 'Low' } },
      Domain: { url: 'https://wfo.techsavyy.com' },
      Notes: {
        rich_text: [{ plain_text: 'Work-from-office/work-from-home tracking app.' }],
      },
    },
  },
];

function richTextToPlain(richText) {
  if (!Array.isArray(richText)) return '';
  return richText.map((block) => block.plain_text || '').join('').trim();
}

function titleToPlain(titleProp) {
  return richTextToPlain(titleProp?.title);
}

function pageToApp(page) {
  const props = page.properties || {};
  const name = titleToPlain(props.Name);
  if (!name) return null;

  return {
    id: page.id,
    name,
    category: props.Category?.select?.name || 'Other',
    status: props.Status?.status?.name || 'Not started',
    priority: props.Priority?.select?.name || null,
    url: props.Domain?.url || null,
    description: richTextToPlain(props.Notes?.rich_text),
  };
}

async function queryAllPages(token, dataSourceId) {
  const pages = [];
  let cursor;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const response = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Notion API ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    pages.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function buildOutput(apps) {
  const sorted = [...apps].sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) return cat;
    return a.name.localeCompare(b.name);
  });

  return {
    updatedAt: new Date().toISOString(),
    source: {
      dataSourceId: process.env.NOTION_DATA_SOURCE_ID || DEFAULT_DATA_SOURCE_ID,
    },
    apps: sorted,
  };
}

async function main() {
  const useMock = process.argv.includes('--mock');
  let pages;

  if (useMock) {
    console.log('Using mock Notion response (--mock).');
    pages = MOCK_PAGES;
  } else {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      console.error('NOTION_TOKEN is required (or pass --mock for sample data).');
      process.exit(1);
    }
    const dataSourceId = process.env.NOTION_DATA_SOURCE_ID || DEFAULT_DATA_SOURCE_ID;
    pages = await queryAllPages(token, dataSourceId);
  }

  const apps = pages.map(pageToApp).filter(Boolean);
  const output = buildOutput(apps);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${apps.length} apps to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
