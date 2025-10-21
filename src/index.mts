#!/usr/bin/env node
import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { analyzeDailyHeadlines, analyzeMonthlyHeadlines, AnalysisError } from './services/analysis.js';
import { AnalyzeHeadlinesSchema, AnalyzeMonthlySchema, analyzeHeadlinesJsonSchema, analyzeMonthlyJsonSchema } from './schemas/headlines.js';
import { normalizeDate, parseDateNL } from './utils/date.js';
import { getConfig, assertRequiredConfig } from './config.js';
import { logger } from './logger.js';

const config = getConfig();
assertRequiredConfig(config);

const server = new Server(
  {
    name: 'headline-vibes',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.onerror = (error: Error) => logger.error({ err: error }, 'Unhandled MCP error');

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server');
  await server.close();
  process.exit(0);
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'analyze_headlines',
      description: 'Analyze investor sentiment for a specific day using curated US news sources.',
      inputSchema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Date input (natural language or YYYY-MM-DD, e.g., "yesterday").',
          },
        },
        required: ['input'],
      },
      outputSchema: analyzeHeadlinesJsonSchema,
    },
    {
      name: 'analyze_monthly_headlines',
      description: 'Summarize monthly sentiment trends across curated US news sources.',
      inputSchema: {
        type: 'object',
        properties: {
          startMonth: {
            type: 'string',
            pattern: '^\\d{4}-(?:0[1-9]|1[0-2])$',
            description: 'Start month in YYYY-MM format.',
          },
          endMonth: {
            type: 'string',
            pattern: '^\\d{4}-(?:0[1-9]|1[0-2])$',
            description: 'End month in YYYY-MM format.',
          },
        },
        required: ['startMonth', 'endMonth'],
      },
      outputSchema: analyzeMonthlyJsonSchema,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  try {
    switch (request.params.name) {
      case 'analyze_headlines': {
        const { input } = request.params.arguments as { input: string };
        if (!input) {
          throw new McpError(ErrorCode.InvalidParams, 'Provide a date input (natural language or YYYY-MM-DD).');
        }

        const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(input) ? normalizeDate(input) : parseDateNL(input);
        const result = await analyzeDailyHeadlines(isoDate);
        AnalyzeHeadlinesSchema.parse(result);

        return {
          content: [
            {
              type: 'text',
              text: formatDailySummary(result.date, result.overall_sentiment.general.score, result.overall_sentiment.investor.score, result.headlines_analyzed, result.sources_analyzed),
            },
          ],
          structuredContent: result,
        };
      }
      case 'analyze_monthly_headlines': {
        const { startMonth, endMonth } = request.params.arguments as { startMonth: string; endMonth: string };
        if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(startMonth) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(endMonth)) {
          throw new McpError(ErrorCode.InvalidParams, 'Months must be provided in YYYY-MM format.');
        }

        const result = await analyzeMonthlyHeadlines(startMonth, endMonth);
        AnalyzeMonthlySchema.parse(result);

        return {
          content: [
            {
              type: 'text',
              text: formatMonthlySummary(result),
            },
          ],
          structuredContent: result,
        };
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    if (error instanceof AnalysisError) {
      throw new McpError(error.code, error.message);
    }
    logger.error({ err: error }, 'Unexpected tool invocation failure');
    throw new McpError(ErrorCode.InternalError, error?.message ?? 'Unexpected error');
  }
});

async function start() {
  if (config.transport === 'http') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);

    const allowedHosts = new Set(config.allowedHosts);
    const allowedOrigins = new Set(config.allowedOrigins);

    const httpServer = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/healthz') {
        res.statusCode = 200;
        res.end('ok');
        return;
      }

      if (!isHostAllowed(req.headers.host, allowedHosts)) {
        res.statusCode = 403;
        res.end('Forbidden host');
        return;
      }
      if (!isOriginAllowed(req.headers.origin, allowedOrigins)) {
        res.statusCode = 403;
        res.end('Forbidden origin');
        return;
      }

      transport.handleRequest(req as any, res).catch((err) => {
        logger.error({ err }, 'HTTP transport error');
        try {
          res.statusCode = 500;
          res.end('Internal Server Error');
        } catch {
          /* noop */
        }
      });
    });

    httpServer.listen(config.port, config.httpHost, () => {
      logger.info({ transport: 'http', host: config.httpHost, port: config.port }, 'Headline Vibes server listening');
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info({ transport: 'stdio' }, 'Headline Vibes server listening');
  }
}

function isHostAllowed(hostHeader: string | undefined, whitelist: Set<string>): boolean {
  if (!whitelist.size || !hostHeader) return true;
  const host = hostHeader.split(':')[0];
  return whitelist.has(host);
}

function isOriginAllowed(originHeader: string | undefined, whitelist: Set<string>): boolean {
  if (!whitelist.size || !originHeader) return true;
  return whitelist.has(originHeader);
}

function formatDailySummary(
  date: string,
  generalScore: number,
  investorScore: number,
  headlines: number,
  sources: number,
): string {
  return [
    `Headline Vibes — ${date}`,
    `General sentiment: ${generalScore.toFixed(2)}`,
    `Investor sentiment: ${investorScore.toFixed(2)}`,
    `Headlines analyzed: ${headlines} across ${sources} sources`,
  ].join('\n');
}

function formatMonthlySummary(result: Awaited<ReturnType<typeof analyzeMonthlyHeadlines>>): string {
  const entries = Object.entries(result.months);
  if (!entries.length) return 'No monthly headline data available for the given range.';
  const lines = entries.map(([month, data]) => {
    const centerScore = data.political_sentiments.center.general.toFixed(2);
    return `${month}: center general sentiment ${centerScore} from ${data.total_headlines} headlines`;
  });
  return ['Headline Vibes — Monthly Summary', ...lines].join('\n');
}

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start Headline Vibes server');
  process.exit(1);
});
