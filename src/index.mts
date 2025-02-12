#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import Sentiment from 'sentiment';
import * as chrono from 'chrono-node';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
if (!NEWS_API_KEY) {
  throw new Error('NEWS_API_KEY environment variable is required');
}

interface Article {
  title: string;
  publishedAt: string;
  source: {
    id: string;
    name: string;
  };
}

interface NewsAPIResponse {
  articles: Article[];
  totalResults: number;
}

// Major US news sources for better coverage
const PREFERRED_SOURCES = [
  'associated-press',
  'reuters',
  'cnn',
  'fox-news',
  'nbc-news',
  'abc-news',
  'the-wall-street-journal',
  'the-washington-post',
  'usa-today',
  'bloomberg',
  'business-insider',
  'time'
].join(',');

interface SentimentResult {
  score: number;
  comparative: number;
}

class HeadlineSentimentServer {
  private server: Server;
  private sentiment: Sentiment;
  private axiosInstance: ReturnType<typeof axios.create>;

  constructor() {
    this.server = new Server(
      {
        name: 'headline-vibes',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.sentiment = new Sentiment();
    this.axiosInstance = axios.create({
      baseURL: 'https://newsapi.org/v2',
      headers: {
        'X-Api-Key': NEWS_API_KEY,
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private normalizeScore(rawScore: number): number {
    // Normalize the raw sentiment score to a 0-10 scale
    // Assuming typical raw scores range from -5 to +5
    const normalized = (rawScore + 5) * (10 / 10);
    return Math.max(0, Math.min(10, normalized));
  }

  private getSentimentSynopsis(normalizedScore: number, headlines: string[]): string {
    // Categorize headlines by sentiment impact
    const sentiments = headlines.map(headline => ({
      text: headline,
      score: this.sentiment.analyze(headline).comparative
    }));

    const strongPositive = sentiments.filter(s => s.score > 0.5);
    const moderatePositive = sentiments.filter(s => s.score > 0.2 && s.score <= 0.5);
    const strongNegative = sentiments.filter(s => s.score < -0.5);
    const moderateNegative = sentiments.filter(s => s.score < -0.2 && s.score >= -0.5);
    
    let marketImpact = "";
    if (normalizedScore < 3) {
      marketImpact = "Market sentiment appears bearish, with significant negative coverage potentially impacting investor confidence.";
    } else if (normalizedScore < 4.5) {
      marketImpact = "Market sentiment leans cautious, with mixed but predominantly negative signals.";
    } else if (normalizedScore < 5.5) {
      marketImpact = "Market sentiment is balanced, with no strong directional bias in the coverage.";
    } else if (normalizedScore < 7) {
      marketImpact = "Market sentiment leans optimistic, with positive developments outweighing concerns.";
    } else {
      marketImpact = "Market sentiment appears bullish, with strong positive coverage likely boosting investor confidence.";
    }

    // Add context about the distribution of sentiment
    const sentimentDistribution = [
      `${strongPositive.length} headlines (${Math.round((strongPositive.length / headlines.length) * 100)}%) show strongly positive sentiment`,
      `${moderatePositive.length} headlines (${Math.round((moderatePositive.length / headlines.length) * 100)}%) show moderately positive sentiment`,
      `${moderateNegative.length} headlines (${Math.round((moderateNegative.length / headlines.length) * 100)}%) show moderately negative sentiment`,
      `${strongNegative.length} headlines (${Math.round((strongNegative.length / headlines.length) * 100)}%) show strongly negative sentiment`
    ].join(', ');

    return `Sentiment Score: ${normalizedScore.toFixed(2)} out of 10\n\n${marketImpact}\n\nSentiment Distribution: ${sentimentDistribution}`;
  }

  private parseDate(query: string): string {
    const now = new Date();
    const parsedDate = chrono.parseDate(query, now, { forwardDate: false });
    
    if (!parsedDate) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Could not understand the date in your query. Please try something like "yesterday", "last Friday", or a specific date.'
      );
    }

    return parsedDate.toISOString().split('T')[0];
  }

  private async analyzeHeadlinesForDate(date: string) {
    try {
      // Fetch headlines in batches using pagination (max pageSize is 100)
      let articles: Article[] = [];
      const pageSize = 100;
      let page = 1;
      const maxHeadlines = 250;
      while (articles.length < maxHeadlines) {
        const response = await this.axiosInstance.get<NewsAPIResponse>('/top-headlines', {
          params: {
            sources: PREFERRED_SOURCES,
            from: date,
            to: date,
            language: 'en',
            pageSize: pageSize,
            page: page,
          },
        });
        if (response.data.articles.length === 0) {
          break;
        }
        articles = articles.concat(response.data.articles);
        if (response.data.articles.length < pageSize) {
          break;
        }
        page++;
      }
      // Limit to maxHeadlines if necessary
      if (articles.length > maxHeadlines) {
        articles = articles.slice(0, maxHeadlines);
      }

      // Track original source distribution before any filtering
      const sourceDistribution: { [key: string]: number } = {};
      articles.forEach(article => {
        const sourceName = article.source.name || 'Unknown';
        sourceDistribution[sourceName] = (sourceDistribution[sourceName] || 0) + 1;
      });

      // Group headlines by source
      const headlinesBySource = articles.reduce((acc: { [key: string]: string[] }, article) => {
        const sourceName = article.source.name || 'Unknown';
        if (!acc[sourceName]) {
          acc[sourceName] = [];
        }
        acc[sourceName].push(article.title);
        return acc;
      }, {});

      // Get an even distribution of headlines from each source
      const headlines: string[] = [];
      const sources = Object.keys(headlinesBySource);
      const maxPerSource = Math.ceil(articles.length / sources.length); // Ensure even distribution

      sources.forEach(source => {
        const sourceHeadlines = headlinesBySource[source];
        const count = Math.min(sourceHeadlines.length, maxPerSource);
        headlines.push(...sourceHeadlines.slice(0, count));
      });

      // Trim to maxHeadlines if we exceeded that
      if (headlines.length > maxHeadlines) {
        headlines.length = maxHeadlines;
      }
      
      if (headlines.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No headlines found for the specified date.',
            },
          ],
        };
      }

      // Analyze sentiment for each headline
      const sentimentScores = headlines.map((headline: string) => 
        this.sentiment.analyze(headline).comparative
      );

      // Calculate average sentiment
      const averageScore = sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length;
      
      // Normalize to 0-10 scale
      const normalizedScore = this.normalizeScore(averageScore);
      
      // Generate synopsis with full headlines context
      const synopsis = this.getSentimentSynopsis(normalizedScore, headlines);

      // Format the response with additional source information
      return {
        score: normalizedScore.toFixed(2),
        synopsis,
        headlines_analyzed: headlines.length,
        sources_analyzed: sources.length,
        source_distribution: sourceDistribution,
        sample_headlines: headlines.slice(0, 10) // Increased sample size
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new McpError(
        ErrorCode.InternalError,
        `NewsAPI error: ${message}`
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_headlines',
          description: 'Analyze sentiment of major news headlines for a given date',
          inputSchema: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date in YYYY-MM-DD format',
              },
            },
            required: ['date'],
          },
        },
        {
          name: 'nlp_analyze_headlines',
          description: 'Analyze sentiment of major news headlines using natural language date query',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language date query (e.g., "yesterday", "last Friday", "March 10th")',
              },
            },
            required: ['query'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      switch (request.params.name) {
        case 'analyze_headlines': {
          const { date } = request.params.arguments as { date: string };
          if (!date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Invalid date format. Please use YYYY-MM-DD'
            );
          }

          const result = await this.analyzeHeadlinesForDate(date);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'nlp_analyze_headlines': {
          const { query } = request.params.arguments as { query: string };
          if (!query) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Please provide a date query (e.g., "yesterday", "last Friday")'
            );
          }

          const date = this.parseDate(query);
          const result = await this.analyzeHeadlinesForDate(date);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Headline Sentiment MCP server running on stdio');
    } catch (error: any) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

const server = new HeadlineSentimentServer();
server.run().catch(error => {
  console.error('Critical server error:', error);
  process.exit(1);
});
