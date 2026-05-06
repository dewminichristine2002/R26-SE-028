def flatten_text_input(x):
    if hasattr(x, "iloc"):
        if getattr(x, "ndim", 1) == 2:
            return x.iloc[:, 0]
        return x
    if hasattr(x, "ndim") and getattr(x, "ndim", 1) == 2:
        return [row[0] for row in x]
    return x
