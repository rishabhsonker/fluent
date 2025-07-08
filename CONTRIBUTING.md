# Contributing to Fluent

Thank you for your interest in contributing to Fluent! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When reporting bugs, include:**
- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots if applicable
- Browser version and OS
- Extension version
- Console error messages

### Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:
- Clear use case explanation
- Why this enhancement would be useful
- Possible implementation approach
- Any mockups or examples

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following our code style
4. **Add tests** for new functionality
5. **Ensure tests pass**: `npm test`
6. **Update documentation** as needed
7. **Commit your changes** with clear messages
8. **Push to your fork** and submit a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/fluent.git
cd fluent

# Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/fluent.git

# Install dependencies
npm install

# Start development
npm run dev
```

## Code Style Guidelines

### TypeScript
- Use TypeScript strict mode
- No `any` types without explicit justification
- Prefer interfaces over type aliases for object shapes
- Use meaningful variable and function names

### React
- Use functional components with hooks
- Keep components small and focused
- Use proper TypeScript types for props
- Avoid inline styles

### General
- Maximum line length: 100 characters
- Use 2 spaces for indentation
- Add comments for complex logic
- Keep functions under 50 lines

### Example Code

```typescript
// Good
interface WordData {
  original: string;
  translation: string;
  language: LanguageCode;
}

function processWord(data: WordData): ProcessedWord {
  // Clear, typed function
  return {
    ...data,
    processed: true,
    timestamp: Date.now()
  };
}

// Bad
function processWord(data: any) {
  // Avoid 'any' and add proper types
  data.processed = true; // Don't mutate inputs
  return data;
}
```

## Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): subject

body

footer
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc)
- `refactor`: Code refactoring
- `test`: Test additions or modifications
- `chore`: Build process or auxiliary tool changes

### Examples
```
feat(translator): add support for Italian language

- Added Italian to supported languages
- Updated language selection UI
- Added Italian translation tests

Closes #123
```

```
fix(tooltip): prevent memory leak in event listeners

- Remove event listeners on component unmount
- Add cleanup in useEffect hooks
```

## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/e2e/extension.spec.ts

# Run in watch mode
npm test -- --watch
```

### Writing Tests
- Write tests for all new features
- Maintain existing test coverage
- Use descriptive test names
- Test edge cases

### Test Structure
```typescript
describe('WordReplacer', () => {
  test('should replace exactly 6 words per page', async () => {
    // Arrange
    const textNodes = createMockTextNodes();
    
    // Act
    const result = await replacer.analyzeText(textNodes);
    
    // Assert
    expect(result).toHaveLength(6);
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update type definitions
- Include examples for complex features

## Review Process

1. **Automated checks** must pass (tests, linting, type checking)
2. **Code review** by at least one maintainer
3. **Testing** on multiple browsers/platforms
4. **Documentation** review for completeness
5. **Security review** for sensitive changes

## Release Process

1. Update version in `manifest.json` and `package.json`
2. Update CHANGELOG.md
3. Run `npm run pre-publish`
4. Create release tag
5. Build and upload to Chrome Web Store

## Questions?

Feel free to:
- Open an issue for questions
- Join our community discussions
- Contact maintainers directly

Thank you for contributing to Fluent! 🎉